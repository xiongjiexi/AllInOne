// Markdown 渲染封装（阅读模式）
// 使用 marked 将 .md 文本渲染为 HTML

import { marked } from 'marked'

marked.setOptions({
  gfm: true,      // GitHub Flavored Markdown
  breaks: false,  // 单换行不转 <br>
})

/** 将 Markdown 文本渲染为 HTML 字符串 */
export function renderMarkdown(md: string): string {
  return marked.parse(md) as string
}
