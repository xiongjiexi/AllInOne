// JSON 格式化/压缩/校验工具

export interface JsonResult {
  ok: boolean
  output: string
  error?: string
}

/** 格式化（美化）JSON */
export function formatJson(input: string, indent = 2): JsonResult {
  if (!input.trim()) return { ok: false, output: '', error: '输入为空' }
  try {
    const parsed = JSON.parse(input)
    return { ok: true, output: JSON.stringify(parsed, null, indent) }
  } catch (e) {
    return { ok: false, output: '', error: (e as Error).message }
  }
}

/** 压缩 JSON */
export function minifyJson(input: string): JsonResult {
  if (!input.trim()) return { ok: false, output: '', error: '输入为空' }
  try {
    const parsed = JSON.parse(input)
    return { ok: true, output: JSON.stringify(parsed) }
  } catch (e) {
    return { ok: false, output: '', error: (e as Error).message }
  }
}

/** 转义 JSON 字符串（把任意字符串转为合法 JSON 字符串字面量） */
export function escapeJsonString(input: string): string {
  return JSON.stringify(input)
}

/** 反转义 JSON 字符串字面量 */
export function unescapeJsonString(input: string): JsonResult {
  try {
    // JSON.parse 接受字符串字面量
    if (!input.trim().startsWith('"')) {
      return { ok: false, output: '', error: '输入不是 JSON 字符串字面量（需以 " 开头）' }
    }
    const parsed = JSON.parse(input)
    if (typeof parsed !== 'string') {
      return { ok: false, output: '', error: '解析结果不是字符串' }
    }
    return { ok: true, output: parsed }
  } catch (e) {
    return { ok: false, output: '', error: (e as Error).message }
  }
}
