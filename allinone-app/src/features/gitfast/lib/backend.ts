// GitFast 前端 → Rust 后端调用封装

import { invoke } from '@tauri-apps/api/core'

/** 启动一个 PTY 会话，返回 sessionId */
export async function ptySpawn(
  repoPath: string,
  cols = 80,
  rows = 24,
): Promise<number> {
  return await invoke<number>('gitfast_pty_spawn', {
    repoPath,
    cols,
    rows,
  })
}

/** 向 PTY 写入数据 */
export async function ptyWrite(sessionId: number, data: string): Promise<void> {
  await invoke<void>('gitfast_pty_write', { sessionId, data })
}

/** 调整 PTY 尺寸 */
export async function ptyResize(
  sessionId: number,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke<void>('gitfast_pty_resize', { sessionId, cols, rows })
}

/** 关闭 PTY 会话 */
export async function ptyKill(sessionId: number): Promise<void> {
  await invoke<void>('gitfast_pty_kill', { sessionId })
}

/** 获取仓库分支列表（用于下拉框） */
export async function gitBranchList(repoPath: string): Promise<string[]> {
  return await invoke<string[]>('gitfast_branch_list', { repoPath })
}
