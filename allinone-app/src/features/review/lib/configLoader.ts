// Code Review 配置文件加载：系统对话框选 YAML + 读取 + 解析

import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import * as yaml from 'js-yaml'
import { validateConfig, mergeWithDefault } from './config'
import type { ReviewConfig } from '../types'
import { DEFAULT_CONFIG } from './defaultConfig'

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

/** 解析 YAML 字符串为 ReviewConfig */
export function parseConfigYAML(text: string): ReviewConfig {
  const obj = yaml.load(text)
  if (!obj || typeof obj !== 'object') {
    throw new Error('配置文件为空或非对象')
  }
  return obj as ReviewConfig
}

/** 加载配置文件：读取 → 解析 → 校验 → 与默认配置合并 */
export async function loadConfigFile(path: string): Promise<ReviewConfig> {
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

  const merged = mergeWithDefault(parsed)

  // logDir 为空时，默认用配置文件同目录的 logs/ 子目录
  if (!merged.logDir) {
    const pathDir = path.replace(/[\\/][^\\/]+$/, '')
    merged.logDir = pathDir + '/logs'
  }

  return merged
}

export { DEFAULT_CONFIG }
