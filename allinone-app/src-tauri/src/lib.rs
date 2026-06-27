//! AllInOne 应用 - Tauri 后端入口
//!
//! 模块划分：
//! - 顶层命令：清单文件操作（list_md_files / read_text_file / write_text_file / ...）
//! - gitfast 模块：PTY 会话管理 + git 命令调用
//!
//! 通过自定义命令绕开 fs 插件的 scope 限制（用户选择的目录任意可写）

mod gitfast;

use gitfast::PtyPool;
use std::fs;
use std::path::PathBuf;

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
            // GitFast 相关命令
            gitfast::commands::gitfast_pty_spawn,
            gitfast::commands::gitfast_pty_write,
            gitfast::commands::gitfast_pty_resize,
            gitfast::commands::gitfast_pty_kill,
            gitfast::commands::gitfast_branch_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
