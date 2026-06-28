// GitFast PTY 会话管理
// 使用 portable-pty 创建伪终端，spawn Git Bash
// 每个仓库一个 PTY 会话，会话 ID 用递增整数标识
// 输出通过 tauri 事件 `gitfast_pty_output` 异步推送到前端

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// 单个 PTY 会话：持有 master（用于 resize / 写入）和 writer
struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
}

/// 全局 PTY 池，由 App state 管理
pub struct PtyPool {
    sessions: Mutex<HashMap<u32, PtySession>>,
    next_id: Mutex<u32>,
}

impl PtyPool {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    fn alloc_id(&self) -> u32 {
        let mut id = self.next_id.lock().unwrap();
        let v = *id;
        *id += 1;
        v
    }

    /// 启动一个 PTY 会话
    pub fn spawn(
        &self,
        app: AppHandle,
        repo_path: String,
        cols: u16,
        rows: u16,
    ) -> Result<u32, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty 失败: {}", e))?;

        // 克隆一份独立 reader 供读线程使用
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone reader 失败: {}", e))?;

        let bash = detect_bash();
        let mut cmd = CommandBuilder::new(&bash);
        cmd.arg("-l"); // 登录 shell
        cmd.cwd(repo_path);

        // spawn 子进程（_child 丢弃但子进程会继续运行；退出时 reader EOF）
        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn bash 失败: {} (bash={})", e, bash))?;

        // 取出 writer（用于向前端输入写入 PTY）
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take_writer 失败: {}", e))?;

        let id = self.alloc_id();

        // 启动读线程：把 PTY 输出转发到前端
        let app_handle = app.clone();
        let session_id = id;
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF：子进程已退出
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_handle.emit(
                            "gitfast_pty_output",
                            serde_json::json!({ "sessionId": session_id, "data": data }),
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app_handle.emit(
                "gitfast_pty_exit",
                serde_json::json!({ "sessionId": session_id }),
            );
        });

        // 注册会话（slave 不再需要，drop）
        drop(pair.slave);
        self.sessions.lock().unwrap().insert(
            id,
            PtySession {
                master: pair.master,
                writer: Mutex::new(writer),
            },
        );

        Ok(id)
    }

    /// 向会话写入数据（前端用户输入 / 命令）
    pub fn write(&self, session_id: u32, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| format!("会话不存在: {}", session_id))?;
        let mut w = session.writer.lock().unwrap();
        w.write_all(data.as_bytes())
            .map_err(|e| format!("write 失败: {}", e))?;
        w.flush().map_err(|e| format!("flush 失败: {}", e))?;
        Ok(())
    }

    /// 调整终端尺寸
    pub fn resize(&self, session_id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| format!("会话不存在: {}", session_id))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize 失败: {}", e))?;
        Ok(())
    }

    /// 关闭并移除会话
    pub fn kill(&self, session_id: u32) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions
            .remove(&session_id)
            .ok_or_else(|| format!("会话不存在: {}", session_id))?;
        // drop session 时 master 关闭，子进程的 stdin 会收到 EOF 自然退出
        Ok(())
    }
}

/// 探测 shell 可执行路径（跨平台）
/// - Windows: 优先 Git Bash（Git for Windows 安装路径）
/// - macOS/Linux: 直接用 bash（系统自带或 Homebrew 安装）
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
        "bash".to_string() // 依赖 PATH
    }
    #[cfg(not(windows))]
    {
        // macOS 自带 /bin/bash；如果用户装了 Homebrew 版也覆盖
        "bash".to_string()
    }
}
