// Code Review 配置校验与合并

import type { ReviewConfig } from '../types'
import { DEFAULT_CONFIG } from './defaultConfig'

/** 简单字段校验，返回错误消息（无错返回 null） */
export function validateConfig(cfg: any): string | null {
  if (cfg.version !== undefined && typeof cfg.version !== 'number') {
    return `version 必须是数字`
  }
  if (cfg.logDir !== undefined && typeof cfg.logDir !== 'string') {
    return `logDir 必须是字符串`
  }
  if (!cfg.platform || typeof cfg.platform !== 'object') {
    return `缺少 platform 配置`
  }
  if (!cfg.platform.url || typeof cfg.platform.url !== 'string') {
    return `platform.url 必须是字符串`
  }
  if (!cfg.platform.accessToken || typeof cfg.platform.accessToken !== 'string') {
    return `platform.accessToken 必须是字符串`
  }
  if (!cfg.script || typeof cfg.script !== 'string') {
    return `script 必须是字符串（脚本文件路径）`
  }
  if (cfg.projects !== undefined) {
    if (!Array.isArray(cfg.projects)) return 'projects 必须是数组'
    for (const p of cfg.projects) {
      if (!p.id || !p.name || !p.repoPath || !p.repoId || !p.fullName || !p.defaultDestBranch) {
        return `每个 project 必须有 id、name、repoPath、repoId、fullName、defaultDestBranch`
      }
    }
  }
  return null
}

/** 合并：用户配置覆盖默认 */
export function mergeWithDefault(override: Partial<ReviewConfig>): ReviewConfig {
  return {
    version: override.version ?? DEFAULT_CONFIG.version,
    logDir: override.logDir ?? DEFAULT_CONFIG.logDir,
    platform: override.platform ?? DEFAULT_CONFIG.platform,
    script: override.script ?? DEFAULT_CONFIG.script,
    projects: override.projects ?? DEFAULT_CONFIG.projects,
  }
}
