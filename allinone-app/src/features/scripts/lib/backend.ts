// Script Runner 前端 → Rust 后端调用封装

import { invoke } from '@tauri-apps/api/core'
import type { ScriptRunResult, ScriptLogEntry } from '../types'

export async function runScript(params: {
  script: string
  workdir: string
  timeoutSecs: number
  logDir: string
  taskId: string
  taskName: string
  trigger: 'manual' | 'schedule'
}): Promise<ScriptRunResult> {
  return await invoke<ScriptRunResult>('scripts_run', params)
}

export async function listLogs(logDir: string, taskId: string): Promise<ScriptLogEntry[]> {
  return await invoke<ScriptLogEntry[]>('scripts_list_logs', { logDir, taskId })
}

export async function readLog(logDir: string, fileName: string): Promise<string> {
  return await invoke<string>('scripts_read_log', { logDir, fileName })
}

export async function deleteLog(logDir: string, fileName: string): Promise<void> {
  await invoke<void>('scripts_delete_log', { logDir, fileName })
}
