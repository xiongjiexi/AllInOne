//! AllInOne 应用 - Tauri 后端入口
//!
//! 模块划分：
//! - 顶层命令：清单文件操作 + Script Runner 脚本执行/日志
//! - gitfast 模块：PTY 会话管理 + git 命令调用
//!
//! 通过自定义命令绕开 fs 插件的 scope 限制（用户选择的目录任意可写）

mod gitfast;

use gitfast::PtyPool;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Instant;

// Windows 下隐藏子进程控制台窗口的辅助函数
// CREATE_NO_WINDOW = 0x08000000，阻止 cmd.exe 黑窗口弹出
#[cfg(target_os = "windows")]
fn no_window(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000)
}
#[cfg(not(target_os = "windows"))]
fn no_window(cmd: &mut Command) -> &mut Command {
    cmd
}

/// 列出目录下所有 .md 文件名（按名称降序，最新日期在前）
#[tauri::command]
fn list_md_files(dir: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Err(format!("不是有效目录: {}", dir));
    }
    let mut names: Vec<String> = fs::read_dir(&path)
        .map_err(|e| format!("读取目录失败: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().ok().map(|t| t.is_file()).unwrap_or(false)
                && e.file_name().to_string_lossy().to_lowercase().ends_with(".md")
        })
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    names.sort_by(|a, b| b.cmp(a));
    Ok(names)
}

/// 读取文本文件
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败 [{}]: {}", path, e))
}

/// 写入文本文件（覆盖）
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入文件失败 [{}]: {}", path, e))
}

/// 判断文件是否存在
#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

/// 路径拼接（跨平台）
#[tauri::command]
fn join_path(dir: String, name: String) -> Result<String, String> {
    let mut p = PathBuf::from(&dir);
    p.push(&name);
    Ok(p.to_string_lossy().to_string())
}

/// 在系统资源管理器中打开并选中指定文件
/// - Windows: explorer.exe /select,"path"
/// - macOS:   open -R "path"
/// - Linux:   xdg-open 父目录（无统一选中方案）
#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW = 0x08000000，避免弹出 cmd 黑窗
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("打开资源管理器失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("打开 Finder 失败: {}", e))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = p.parent().unwrap_or(std::path::Path::new("."));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {}", e))?;
    }

    Ok(())
}

// ============================================================
// Script Runner 命令
// ============================================================

/// 脚本执行结果
#[derive(serde::Serialize)]
struct ScriptRunResult {
    success: bool,
    exit_code: i32,
    duration_ms: u64,
    stdout: String,
    stderr: String,
}

/// 日志条目（列表展示用）
#[derive(serde::Serialize)]
struct ScriptLogEntry {
    /// 日志文件名（不含路径），如 `daily-pull_20260627_090000.log`
    file_name: String,
    /// 任务 ID（从文件名解析）
    task_id: String,
    /// 时间戳（从文件名解析，格式 YYYYMMDD_HHMMSS）
    timestamp: String,
    /// 日志文件大小（字节）
    size: u64,
}

/// 执行脚本文件
/// - script: 脚本文件路径（.sh/.bash 用 bash 执行，.bat/.cmd 用 cmd 执行）
/// - workdir: 工作目录（可选，空则用脚本所在目录）
/// - timeout_secs: 超时秒数（0=不超时）
/// - log_dir: 日志目录（用于写入日志文件，空则不写日志）
/// - task_id: 任务 ID（用于日志文件命名）
/// - task_name: 任务名称（写入日志头部）
/// - trigger: 触发方式 "manual" / "schedule"
/// - env: 注入的环境变量（可选）
#[tauri::command]
fn scripts_run(
    script: String,
    workdir: String,
    timeout_secs: u64,
    log_dir: String,
    task_id: String,
    task_name: String,
    trigger: String,
    env: Option<HashMap<String, String>>,
) -> Result<ScriptRunResult, String> {
    let start = Instant::now();

    // 工作目录：空则用脚本所在目录
    let cwd = if workdir.is_empty() {
        PathBuf::from(&script)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&workdir)
    };

    // 构造 shell 命令（按后缀选执行器）
    let (program, args) = build_shell_command(&script);

    let mut cmd = Command::new(&program);
    cmd.args(&args);
    cmd.current_dir(&cwd);
    // 注入环境变量
    if let Some(envs) = &env {
        for (k, v) in envs {
            cmd.env(k, v);
        }
    }
    // 隐藏 Windows 控制台窗口
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    // 统一用 spawn + 独立线程读取 stdout/stderr，避免管道缓冲区满导致脚本阻塞
    // （Windows 管道默认 4KB，try_wait 不消费管道会死锁）
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动命令失败: {} (program={})", e, program))?;

    // 独立线程读取 stdout/stderr，避免管道阻塞
    let mut stdout_handle = child.stdout.take();
    let mut stderr_handle = child.stderr.take();

    let stdout_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(ref mut h) = stdout_handle {
            let _ = h.read_to_end(&mut buf);
        }
        buf
    });

    let stderr_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(ref mut h) = stderr_handle {
            let _ = h.read_to_end(&mut buf);
        }
        buf
    });

    // 超时控制：轮询 wait，超时则 kill
    let timeout = if timeout_secs > 0 {
        Some(std::time::Duration::from_secs(timeout_secs))
    } else {
        None
    };
    let mut killed = false;

    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if let Some(t) = timeout {
                    if start.elapsed() >= t {
                        let _ = child.kill();
                        killed = true;
                        break;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(_) => break,
        }
    }

    // 等待子进程彻底结束（kill 后也需要 wait 回收）
    let status = child.wait().ok();

    // 回收线程获取输出（即使被 kill，已写入管道的内容也能读到）
    let stdout_bytes = stdout_thread.join().unwrap_or_default();
    let stderr_bytes = stderr_thread.join().unwrap_or_default();

    let (success, exit_code) = if killed {
        (false, -1)
    } else {
        (
            status.map(|s| s.success()).unwrap_or(false),
            status.and_then(|s| s.code()).unwrap_or(-1),
        )
    };

    let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
    let mut stderr = String::from_utf8_lossy(&stderr_bytes).to_string();

    if killed {
        let timeout_msg = format!("\n[执行超时（{}秒），进程已被终止]", timeout_secs);
        if stderr.is_empty() {
            stderr = timeout_msg;
        } else {
            stderr.push_str(&timeout_msg);
        }
    }

    let result = ScriptRunResult {
        success,
        exit_code,
        duration_ms: start.elapsed().as_millis() as u64,
        stdout,
        stderr,
    };

    // 写日志文件
    write_log_file(&log_dir, &task_id, &task_name, &trigger, &script, &cwd, &result);

    Ok(result)
}

/// 构造 shell 调用：按脚本后缀选执行器
fn build_shell_command(script: &str) -> (String, Vec<String>) {
    let lower = script.to_lowercase();

    // .sh / .bash → 用 bash 执行
    if lower.ends_with(".sh") || lower.ends_with(".bash") {
        let bash = detect_bash();
        return (bash, vec![script.to_string()]);
    }

    // .bat / .cmd → 用 cmd 执行（仅 Windows）
    #[cfg(target_os = "windows")]
    if lower.ends_with(".bat") || lower.ends_with(".cmd") {
        return ("cmd.exe".to_string(), vec!["/C".to_string(), script.to_string()]);
    }

    // 默认：当作命令字符串
    #[cfg(target_os = "windows")]
    {
        ("cmd.exe".to_string(), vec!["/C".to_string(), script.to_string()])
    }
    #[cfg(not(target_os = "windows"))]
    {
        ("sh".to_string(), vec!["-c".to_string(), script.to_string()])
    }
}

/// 检测 bash 可执行文件路径（复用 GitFast 逻辑）
fn detect_bash() -> String {
    #[cfg(windows)]
    {
        let candidates = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files\Git\usr\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ];
        for c in candidates {
            if std::path::Path::new(c).exists() {
                return c.to_string();
            }
        }
        "bash".to_string()
    }
    #[cfg(not(windows))]
    {
        "bash".to_string()
    }
}

/// 写日志文件
/// 文件名：<taskId>_<YYYYMMDD_HHMMSS>.log
/// 目录不存在则创建
fn write_log_file(
    log_dir: &str,
    task_id: &str,
    task_name: &str,
    trigger: &str,
    script: &str,
    cwd: &std::path::Path,
    result: &ScriptRunResult,
) {
    if log_dir.is_empty() {
        return;
    }
    let log_dir_path = PathBuf::from(log_dir);
    if !log_dir_path.exists() {
        let _ = fs::create_dir_all(&log_dir_path);
    }

    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let file_name = format!("{}_{}.log", task_id, timestamp);
    let log_path = log_dir_path.join(&file_name);

    let status_text = if result.success { "成功" } else { "失败" };
    let log_content = format!(
        "========================================\n\
         任务：{}\n\
         脚本：{}\n\
         工作目录：{}\n\
         触发时间：{}\n\
         触发方式：{}\n\
         ========================================\n\
         \n\
         ---------- stdout ----------\n\
         {}\n\
         \n\
         ---------- stderr ----------\n\
         {}\n\
         \n\
         ========================================\n\
         退出码：{}\n\
         耗时：{:.1}s\n\
         状态：{}\n\
         ========================================\n",
        task_name,
        script,
        cwd.display(),
        now.format("%Y-%m-%d %H:%M:%S"),
        trigger,
        result.stdout,
        result.stderr,
        result.exit_code,
        result.duration_ms as f64 / 1000.0,
        status_text
    );

    let _ = fs::write(&log_path, log_content);
}

/// 列出某任务的日志文件（按时间倒序，最多 50 条）
#[tauri::command]
fn scripts_list_logs(log_dir: String, task_id: String) -> Result<Vec<ScriptLogEntry>, String> {
    let log_dir_path = PathBuf::from(&log_dir);
    if !log_dir_path.is_dir() {
        return Ok(vec![]);
    }

    let prefix = format!("{}_", task_id);
    let mut entries: Vec<ScriptLogEntry> = fs::read_dir(&log_dir_path)
        .map_err(|e| format!("读取日志目录失败: {}", e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let file_name = e.file_name().to_string_lossy().to_string();
            if !file_name.starts_with(&prefix) || !file_name.ends_with(".log") {
                return None;
            }
            // 解析 timestamp：<taskId>_<YYYYMMDD_HHMMSS>.log
            let timestamp = file_name
                .strip_prefix(&prefix)
                .and_then(|s| s.strip_suffix(".log"))
                .unwrap_or("")
                .to_string();
            let size = e.metadata().ok()?.len();
            Some(ScriptLogEntry {
                file_name,
                task_id: task_id.clone(),
                timestamp,
                size,
            })
        })
        .collect();

    // 按时间戳倒序（最新的在前）
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    // 最多 50 条
    entries.truncate(50);
    Ok(entries)
}

/// 读取日志文件内容
#[tauri::command]
fn scripts_read_log(log_dir: String, file_name: String) -> Result<String, String> {
    let log_path = PathBuf::from(&log_dir).join(&file_name);
    if !log_path.exists() {
        return Err(format!("日志文件不存在: {}", file_name));
    }
    fs::read_to_string(&log_path).map_err(|e| format!("读取日志失败: {}", e))
}

/// 删除日志文件
#[tauri::command]
fn scripts_delete_log(log_dir: String, file_name: String) -> Result<(), String> {
    let log_path = PathBuf::from(&log_dir).join(&file_name);
    if log_path.exists() {
        fs::remove_file(&log_path).map_err(|e| format!("删除日志失败: {}", e))?;
    }
    Ok(())
}

// ============================================================
// Code Review 命令
// ============================================================

/// 列出指定仓库的所有分支（本地 + 远程，去重，去除 HEAD 引用）
/// 复用 gitfast 的分支拉取逻辑，独立命令便于 Review 工具调用
/// 异步实现：用 spawn_blocking 避免阻塞 Tauri IPC
#[tauri::command]
async fn review_branch_list(repo_path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("git");
        cmd.args(["branch", "-a"]).current_dir(&repo_path);
        no_window(&mut cmd);
        let output = cmd
            .output()
            .map_err(|e| format!("执行 git branch -a 失败: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git branch -a 失败: {}", err));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut branches: Vec<String> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for line in stdout.lines() {
            let mut s = line.trim().trim_start_matches('*').trim().to_string();
            // 去除远程前缀
            if let Some(stripped) = s.strip_prefix("remotes/") {
                s = stripped.to_string();
            }
            // 跳过 HEAD 指针行
            if s.contains("->") || s.is_empty() {
                continue;
            }
            // 去重
            if seen.insert(s.clone()) {
                branches.push(s);
            }
        }
        Ok(branches)
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// Review 仓库状态：当前分支、上游分支、最近 5 个本地分支（按提交时间倒序）
/// 用于卡片展开时快速填充默认值，避免等待完整分支列表
#[derive(serde::Serialize)]
struct ReviewRepoStatus {
    /// 当前分支（git rev-parse --abbrev-ref HEAD），DETACHED 时为空
    current_branch: String,
    /// 上游分支（如 origin/develop），无上游时为空
    upstream: String,
    /// 最近 5 个本地分支（按最近提交时间倒序）
    recent_local: Vec<String>,
}

#[tauri::command]
async fn review_repo_status(repo_path: String) -> Result<ReviewRepoStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 当前分支
        let mut cmd = Command::new("git");
        cmd.args(["rev-parse", "--abbrev-ref", "HEAD"]).current_dir(&repo_path);
        no_window(&mut cmd);
        let current = cmd
            .output()
            .map_err(|e| format!("获取当前分支失败: {}", e))?;
        let current_branch = String::from_utf8_lossy(&current.stdout).trim().to_string();
        let current_branch = if current_branch == "HEAD" { String::new() } else { current_branch };

        // 上游分支
        let mut cmd = Command::new("git");
        cmd.args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).current_dir(&repo_path);
        no_window(&mut cmd);
        let upstream_out = cmd.output();
        let upstream = match upstream_out {
            Ok(o) if o.status.success() => {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                // 去除 origin/ 前缀，仅保留分支名
                s.strip_prefix("origin/").unwrap_or(&s).to_string()
            }
            _ => String::new(),
        };

        // 最近 5 个本地分支（按提交时间倒序）
        let mut cmd = Command::new("git");
        cmd.args(["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "--count=5", "refs/heads/"]).current_dir(&repo_path);
        no_window(&mut cmd);
        let recent_out = cmd
            .output()
            .map_err(|e| format!("获取最近分支失败: {}", e))?;
        let recent_local: Vec<String> = String::from_utf8_lossy(&recent_out.stdout)
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(ReviewRepoStatus {
            current_branch,
            upstream,
            recent_local,
        })
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// 源分支最新一次提交信息（用于展示，用户自行复制）
#[derive(serde::Serialize)]
struct ReviewLatestCommit {
    /// 短 hash，如 "a1b2c3d"
    hash: String,
    /// commit 标题（首行）
    subject: String,
}

/// 获取指定分支最新一次提交
/// 用 git log -1 --pretty=format:%h%n%s <branch>
#[tauri::command]
async fn review_latest_commit(repo_path: String, branch: String) -> Result<ReviewLatestCommit, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("git");
        cmd.args(["log", "-1", "--pretty=format:%h%n%s", &branch]).current_dir(&repo_path);
        no_window(&mut cmd);
        let output = cmd
            .output()
            .map_err(|e| format!("执行 git log 失败: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git log 失败: {}", err.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut lines = stdout.lines();
        let hash = lines.next().unwrap_or("").trim().to_string();
        let subject = lines.next().unwrap_or("").trim().to_string();

        if hash.is_empty() {
            return Err("分支无提交记录".to_string());
        }

        Ok(ReviewLatestCommit { hash, subject })
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .manage(PtyPool::new())
        .invoke_handler(tauri::generate_handler![
            // 清单相关命令
            list_md_files,
            read_text_file,
            write_text_file,
            path_exists,
            join_path,
            open_in_explorer,
            // GitFast 相关命令
            gitfast::commands::gitfast_pty_spawn,
            gitfast::commands::gitfast_pty_write,
            gitfast::commands::gitfast_pty_resize,
            gitfast::commands::gitfast_pty_kill,
            gitfast::commands::gitfast_branch_list,
            // Script Runner 相关命令
            scripts_run,
            scripts_list_logs,
            scripts_read_log,
            scripts_delete_log,
            // Code Review 相关命令
            review_branch_list,
            review_repo_status,
            review_latest_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
