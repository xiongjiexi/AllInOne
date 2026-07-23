// 笔记工具文件系统操作封装
// 全部通过自定义 Rust 命令实现，避免 fs 插件的 scope 限制

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

/** 选择一个文件夹，返回绝对路径；取消则返回 null */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false })
  if (!selected) return null
  return typeof selected === 'string' ? selected : null
}

/** 带元数据的 .md 文件条目 */
export interface MdFileEntry {
  name: string
  mtime: number  // 毫秒时间戳
  size: number   // 字节
}

/** 列出目录下所有 .md 文件（含修改时间/大小，按修改时间倒序） */
export async function listMarkdownFilesWithMeta(dir: string): Promise<MdFileEntry[]> {
  return await invoke<MdFileEntry[]>('notes_list_md_files', { dir })
}

/** 路径拼接（跨平台，由 Rust 处理） */
export async function joinPath(dir: string, name: string): Promise<string> {
  return await invoke<string>('join_path', { dir, name })
}

/** 读取文本文件 */
export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>('read_text_file', { path })
}

/** 写入文本文件（覆盖） */
export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke<void>('write_text_file', { path, content })
}

/** 判断文件是否存在 */
export async function fileExists(path: string): Promise<boolean> {
  return await invoke<boolean>('path_exists', { path })
}

/** 在系统资源管理器中打开并选中文件 */
export async function openInExplorer(path: string): Promise<void> {
  await invoke<void>('open_in_explorer', { path })
}

/** 重命名文件（同目录内重命名） */
export async function renameFile(oldPath: string, newName: string): Promise<string> {
  return await invoke<string>('notes_rename_file', { old: oldPath, newName })
}

/** 删除文件 */
export async function deleteFile(path: string): Promise<void> {
  await invoke<void>('notes_delete_file', { path })
}

/** 获取文件修改时间（毫秒时间戳） */
export async function fileMtime(path: string): Promise<number> {
  const stat = await invoke<{ mtime: number; size: number }>('notes_file_stat', { path })
  return stat.mtime
}

/**
 * 如果目标文件已存在，自动追加 -2、-3 后缀
 * 返回最终路径
 */
export async function uniquePath(dir: string, baseName: string): Promise<string> {
  let path = await joinPath(dir, baseName)
  if (!(await fileExists(path))) return path

  const dot = baseName.lastIndexOf('.')
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName
  const ext = dot > 0 ? baseName.slice(dot) : ''

  let n = 2
  while (true) {
    const candidate = await joinPath(dir, `${stem}-${n}${ext}`)
    if (!(await fileExists(candidate))) return candidate
    n++
  }
}
