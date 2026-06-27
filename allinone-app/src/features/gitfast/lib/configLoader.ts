// 配置文件加载：系统对话框选 YAML + 读取 + 解析

import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { parseConfigYAML, validateConfig, mergeWithDefault } from './config'
import type { GitFastConfig } from '../types'

/** 读取本地文本文件（复用清单的自定义命令） */
async function readTextFile(path: string): Promise<string> {
  return await invoke<string>('read_text_file', { path })
}

/** 弹系统文件对话框选 YAML，返回路径；取消返回 null */
export async function pickConfigFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
  })
  if (!selected) return null
  return typeof selected === 'string' ? selected : null
}

/**
 * 加载配置文件：读取 → 解析 → 校验 → 与默认配置合并
 * 失败抛错，错误消息已友好化
 */
export async function loadConfigFile(path: string): Promise<GitFastConfig> {
  let text: string
  try {
    text = await readTextFile(path)
  } catch (e: any) {
    throw new Error(`读取文件失败: ${e?.message ?? e}`)
  }

  let parsed: any
  try {
    parsed = parseConfigYAML(text)
  } catch (e: any) {
    throw new Error(`YAML 解析失败: ${e?.message ?? e}`)
  }

  const err = validateConfig(parsed)
  if (err) throw new Error(`配置校验失败: ${err}`)

  return mergeWithDefault(parsed)
}
