// GitFast 配置文件加载与合并
// 三层覆盖：代码默认 → 用户配置文件 → localStorage 运行时

import * as yaml from 'js-yaml'
import type { GitFastConfig } from '../types'
import { DEFAULT_CONFIG } from './defaultConfig'

/** 解析 YAML 字符串为 GitFastConfig，校验失败抛错 */
export function parseConfigYAML(text: string): GitFastConfig {
  const obj = yaml.load(text)
  if (!obj || typeof obj !== 'object') {
    throw new Error('配置文件为空或非对象')
  }
  return obj as GitFastConfig
}

/** 简单字段级校验，返回错误消息（无错返回 null） */
export function validateConfig(cfg: any): string | null {
  if (cfg.version !== undefined && typeof cfg.version !== 'number') {
    return `version 字段必须是数字，当前为 ${typeof cfg.version}`
  }
  if (cfg.settings !== undefined) {
    if (typeof cfg.settings !== 'object') return 'settings 必须是对象'
    if (cfg.settings.maxParallel !== undefined && typeof cfg.settings.maxParallel !== 'number') {
      return 'settings.maxParallel 必须是数字'
    }
  }
  if (cfg.groups !== undefined) {
    if (!Array.isArray(cfg.groups)) return 'groups 必须是数组'
    for (const g of cfg.groups) {
      if (!g.id || !g.name) return '每个 group 必须有 id 和 name'
    }
  }
  if (cfg.repositories !== undefined) {
    if (!Array.isArray(cfg.repositories)) return 'repositories 必须是数组'
    for (const r of cfg.repositories) {
      if (!r.id || !r.name || !r.path) return '每个 repository 必须有 id、name、path'
    }
  }
  if (cfg.templates !== undefined) {
    if (!Array.isArray(cfg.templates)) return 'templates 必须是数组'
    for (const t of cfg.templates) {
      if (!t.id || !t.name || !Array.isArray(t.commands)) {
        return '每个 template 必须有 id、name、commands'
      }
    }
  }
  return null
}

/**
 * 深合并：用户配置覆盖默认配置
 * - 数组字段（groups/repositories/templates）整体替换（不做元素级合并）
 * - 对象字段（settings）逐字段合并
 */
export function mergeConfig(base: GitFastConfig, override: Partial<GitFastConfig>): GitFastConfig {
  return {
    version: override.version ?? base.version,
    settings: { ...base.settings, ...(override.settings ?? {}) },
    groups: override.groups ?? base.groups,
    repositories: override.repositories ?? base.repositories,
    templates: override.templates ?? base.templates,
  }
}

/** 从默认配置出发合并用户配置 */
export function mergeWithDefault(override: Partial<GitFastConfig>): GitFastConfig {
  return mergeConfig(DEFAULT_CONFIG, override)
}
