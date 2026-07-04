// Unicode 编解码工具

/**
 * 把字符串编码为 Unicode 转义序列
 * 例如："中文" -> "\\u4e2d\\u6587"
 * 支持 BMP 外字符（emoji）：用代理对表示
 */
export function encodeUnicode(input: string, useES6 = false): string {
  let out = ''
  for (const ch of input) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) {
      // ASCII 可见字符直接输出
      out += ch
    } else if (useES6 && cp > 0xffff) {
      // ES6 码点表示法 \u{xxxxx}
      out += `\\u{${cp.toString(16)}}`
    } else if (cp > 0xffff) {
      // 代理对
      const high = 0xd800 + ((cp - 0x10000) >> 10)
      const low = 0xdc00 + ((cp - 0x10000) & 0x3ff)
      out += `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`
    } else {
      out += `\\u${cp.toString(16).padStart(4, '0')}`
    }
  }
  return out
}

/**
 * 把 Unicode 转义序列解码为字符串
 * 支持：\uXXXX、\u{XXXXX}（ES6）、代理对组合
 */
export function decodeUnicode(input: string): { ok: boolean; output: string; error?: string } {
  try {
    // 先处理 \u{XXXXX} 形式
    let result = input.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => {
      return String.fromCodePoint(parseInt(hex, 16))
    })
    // 再处理 \uXXXX 形式（含代理对自动拼合）
    result = result.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16))
    })
    // 代理对会被 fromCharCode 自动合并（JS 字符串就是 UTF-16）
    return { ok: true, output: result }
  } catch (e) {
    return { ok: false, output: '', error: (e as Error).message }
  }
}

/**
 * 编码为 Base64（UTF-8 安全）
 */
export function encodeBase64(input: string): string {
  // 用 TextEncoder 处理 UTF-8
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * 解码 Base64（UTF-8 安全）
 */
export function decodeBase64(input: string): { ok: boolean; output: string; error?: string } {
  try {
    const binary = atob(input.trim())
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { ok: true, output: new TextDecoder().decode(bytes) }
  } catch (e) {
    return { ok: false, output: '', error: (e as Error).message }
  }
}
