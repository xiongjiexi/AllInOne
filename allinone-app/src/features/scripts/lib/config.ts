// Script Runner 配置解析与校验

import type { ScriptRunnerConfig } from '../types'
import { DEFAULT_CONFIG } from './defaultConfig'

/** 简单字段校验，返回错误消息（无错返回 null） */
export function validateConfig(cfg: any): string | null {
  if (cfg.version !== undefined && typeof cfg.version !== 'number') {
    return `version 必须是数字`
  }
  if (cfg.logDir !== undefined && typeof cfg.logDir !== 'string') {
    return `logDir 必须是字符串`
  }
  if (cfg.tasks !== undefined) {
    if (!Array.isArray(cfg.tasks)) return 'tasks 必须是数组'
    for (const t of cfg.tasks) {
      if (!t.id || !t.name || !t.script) return '每个 task 必须有 id、name、script'
      if (!t.rule) return `task "${t.id}" 缺少 rule`
      if (t.rule.type !== 'daily' && t.rule.type !== 'interval') {
        return `task "${t.id}" 的 rule.type 必须是 daily 或 interval`
      }
      if (t.rule.type === 'daily' && !t.rule.time) {
        return `task "${t.id}" 的 rule.type=daily 必须指定 time`
      }
      if (t.rule.type === 'interval' && (typeof t.rule.minutes !== 'number' || t.rule.minutes <= 0)) {
        return `task "${t.id}" 的 rule.type=interval 必须指定正数 minutes`
      }
    }
  }
  return null
}

/** 合并：用户配置覆盖默认 */
export function mergeWithDefault(override: Partial<ScriptRunnerConfig>): ScriptRunnerConfig {
  return {
    version: override.version ?? DEFAULT_CONFIG.version,
    logDir: override.logDir ?? DEFAULT_CONFIG.logDir,
    tasks: override.tasks ?? DEFAULT_CONFIG.tasks,
  }
}
