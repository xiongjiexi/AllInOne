// 模板命令渲染：把 {branch} / {date} 等占位符替换为实际值

import type { CommandTemplate } from '../types'

/** 占位符 → 实际值 的映射表 */
export type ParamValues = Record<string, string>

/** 替换命令中的 {key} 占位符 */
export function renderCommand(command: string, params: ParamValues): string {
  return command.replace(/\{(\w+)\}/g, (m, key: string) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) return params[key]
    return m // 未提供的占位符保留原样
  })
}

/** 把整条模板的命令序列渲染为 shell 字符串（用 && 串联，前序失败则停止） */
export function renderTemplate(template: CommandTemplate, params: ParamValues): string {
  return template.commands.map(c => renderCommand(c, params)).join(' && ')
}

/** 取当天日期 YYYY-MM-DD（本地时区） */
export function todayDateStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

