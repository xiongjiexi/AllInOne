// Markdown 清单解析与序列化
// 兼容 Obsidian 语法：- [ ] / - [x]
// 设计原则：保留非清单行原样，仅识别与操作清单项

/** 单个清单项 */
export interface CheckItem {
  /** 在文件中的行号（从 0 开始） */
  lineIndex: number
  /** 缩进空格数（用于支持子任务） */
  indent: number
  /** 是否已完成 */
  checked: boolean
  /** 任务文本（去掉前缀后的内容） */
  text: string
  /** 原始整行（用于回写时保留不可识别部分） */
  raw: string
}

/** 解析结果 */
export interface ParsedMarkdown {
  /** 所有行（含空行/标题/备注） */
  lines: string[]
  /** 识别到的清单项 */
  items: CheckItem[]
}

const ITEM_RE = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/

/** 解析整篇 Markdown */
export function parseMarkdown(content: string): ParsedMarkdown {
  const lines = content.split(/\r?\n/)
  const items: CheckItem[] = []

  lines.forEach((line, idx) => {
    const m = line.match(ITEM_RE)
    if (m) {
      items.push({
        lineIndex: idx,
        indent: m[1].length,
        checked: m[2].toLowerCase() === 'x',
        text: m[3],
        raw: line,
      })
    }
  })

  return { lines, items }
}

/** 将清单项序列化回行文本 */
export function serializeItem(item: CheckItem): string {
  const mark = item.checked ? '[x]' : '[ ]'
  const indent = ' '.repeat(item.indent)
  return `${indent}- ${mark} ${item.text}`
}

/** 把解析结果重新组装为字符串（用于整文件回写） */
export function stringify(parsed: ParsedMarkdown): string {
  return parsed.lines.join('\n')
}

/** 替换某一行（用于勾选/编辑后回写） */
export function replaceLine(parsed: ParsedMarkdown, lineIndex: number, newLine: string): string {
  const lines = parsed.lines.slice()
  lines[lineIndex] = newLine
  return lines.join('\n')
}

/** 提取所有未完成项（用于迁移到新清单） */
export function extractUnchecked(parsed: ParsedMarkdown): CheckItem[] {
  return parsed.items.filter(i => !i.checked)
}

/**
 * 把某一项的物理行从 fromLine 移动到 toLine 之前或之后
 * - 仅搬移该清单项所在的单行（raw），不影响其他非清单行
 * - 返回新的完整文件内容字符串
 * @param fromLine 源项的 lineIndex
 * @param toLine   目标项的 lineIndex
 * @param position 'before' 插到目标前 / 'after' 插到目标后
 */
export function moveItemLine(
  parsed: ParsedMarkdown,
  fromLine: number,
  toLine: number,
  position: 'before' | 'after'
): string {
  if (fromLine === toLine) return parsed.lines.join('\n')
  const lines = parsed.lines.slice()
  // 取出源行
  const [moved] = lines.splice(fromLine, 1)
  // 计算目标在删除后的新位置
  let target = toLine
  if (fromLine < toLine) target -= 1
  const insertAt = position === 'before' ? target : target + 1
  lines.splice(insertAt, 0, moved)
  return lines.join('\n')
}

/**
 * 生成标准清单文件内容
 * @param title 清单标题（显示在 # 一级标题中，如 "2026-06-25" 或 "项目计划"）
 * @param items 初始待办项文本数组
 */
export function buildChecklistContent(title: string, items: string[] = []): string {
  const header = `# ${title} 清单\n\n## 待办\n\n`
  const body = items.length > 0
    ? items.map(t => `- [ ] ${t}`).join('\n') + '\n'
    : ''
  const footer = '\n## 备注\n\n'
  return header + body + footer
}

/** 当天日期字符串 YYYY-MM-DD（本地时区） */
export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 计算下一天日期字符串 */
export function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 从文件名提取日期（如 2026-06-25.md -> 2026-06-25） */
export function dateFromFilename(filename: string): string | null {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
  return m ? m[1] : null
}
