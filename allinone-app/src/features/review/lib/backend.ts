// Code Review 前端 → Rust 后端调用封装

import { invoke } from '@tauri-apps/api/core'
import type { ReviewRunResult, ReviewLogEntry, ReviewRepoStatus, ReviewLatestCommit } from '../types'

/** 执行评审脚本（注入环境变量） */
export async function runReviewScript(params: {
  script: string
  workdir: string
  timeoutSecs: number
  logDir: string
  taskId: string
  taskName: string
  trigger: 'manual'
  env: Record<string, string>
}): Promise<ReviewRunResult> {
  return await invoke<ReviewRunResult>('scripts_run', params)
}

/** 列出仓库的所有分支（异步，不阻塞 IPC） */
export async function listBranches(repoPath: string): Promise<string[]> {
  return await invoke<string[]>('review_branch_list', { repoPath })
}

/** 获取仓库状态（当前分支、上游、最近本地分支） */
export async function getRepoStatus(repoPath: string): Promise<ReviewRepoStatus> {
  return await invoke<ReviewRepoStatus>('review_repo_status', { repoPath })
}

/** 获取指定分支最新一次提交（hash + subject） */
export async function getLatestCommit(repoPath: string, branch: string): Promise<ReviewLatestCommit> {
  return await invoke<ReviewLatestCommit>('review_latest_commit', { repoPath, branch })
}

/** 列出某项目的日志文件（按时间倒序，最多 50 条） */
export async function listLogs(logDir: string, taskId: string): Promise<ReviewLogEntry[]> {
  return await invoke<ReviewLogEntry[]>('scripts_list_logs', { logDir, taskId })
}

/** 读取日志文件内容 */
export async function readLog(logDir: string, fileName: string): Promise<string> {
  return await invoke<string>('scripts_read_log', { logDir, fileName })
}

/** 删除日志文件 */
export async function deleteLog(logDir: string, fileName: string): Promise<void> {
  await invoke<void>('scripts_delete_log', { logDir, fileName })
}
