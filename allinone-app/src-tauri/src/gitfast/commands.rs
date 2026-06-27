// GitFast Tauri 命令：暴露给前端调用的接口
// 命名约定：gitfast_ 前缀，避免与清单命令冲突

use crate::gitfast::PtyPool;
use std::process::Command;
use tauri::{AppHandle, State};

/// 启动一个 PTY 会话，返回 sessionId
#[tauri::command]
pub fn gitfast_pty_spawn(
    app: AppHandle,
    pool: State<'_, PtyPool>,
    repo_path: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<u32, String> {
    pool.spawn(app, repo_path, cols.unwrap_or(80), rows.unwrap_or(24))
}

/// 向 PTY 写入数据（用户输入 / 命令）
#[tauri::command]
pub fn gitfast_pty_write(
    pool: State<'_, PtyPool>,
    session_id: u32,
    data: String,
) -> Result<(), String> {
    pool.write(session_id, &data)
}

/// 调整 PTY 尺寸
#[tauri::command]
pub fn gitfast_pty_resize(
    pool: State<'_, PtyPool>,
    session_id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pool.resize(session_id, cols, rows)
}

/// 关闭 PTY 会话
#[tauri::command]
pub fn gitfast_pty_kill(
    pool: State<'_, PtyPool>,
    session_id: u32,
) -> Result<(), String> {
    pool.kill(session_id)
}

/// 获取仓库的分支列表（用于下拉框数据源）
/// 非交互命令，直接用 std::process::Command 跑
#[tauri::command]
pub fn gitfast_branch_list(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(["branch", "-a"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("执行 git branch -a 失败: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git branch -a 失败: {}", err));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().trim_start_matches('*').trim().to_string())
        .filter(|l| !l.is_empty() && !l.contains("->"))
        .collect();
    Ok(branches)
}
