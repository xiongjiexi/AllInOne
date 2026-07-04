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
 * 把多条待办文本追加到"## 待办"段末尾
 * - 若文件中已有 "## 待办" 段，则在该段最后一个清单项后追加
 * - 若无 "## 待办" 段但有其他 "## xxx" 段，则在第一个 "## " 段前插入新段
 * - 若文件完全空或无任何二级标题，则在末尾追加新段
 * - 追加的项均为未完成状态 `- [ ] xxx`
 * @returns 修改后的完整文件内容
 */
export function appendItemsToTodo(parsed: ParsedMarkdown, texts: string[]): string {
  if (texts.length === 0) return parsed.lines.join('\n')
  const lines = parsed.lines.slice()
  const todoHeaderRe = /^##\s+待办\s*$/

  // 找到 "## 待办" 段的范围
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (todoHeaderRe.test(lines[i])) {
      headerIdx = i
      break
    }
  }

  if (headerIdx !== -1) {
    // 已有待办段：在该段最后一个清单项后追加
    let insertAt = headerIdx + 1
    // 跳过段头后的空行
    while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++
    // 找到段内最后一个清单项
    let lastItemIdx = -1
    for (let j = headerIdx + 1; j < lines.length; j++) {
      if (/^##\s+/.test(lines[j])) break // 进入下一个段
      if (ITEM_RE.test(lines[j])) lastItemIdx = j
    }
    insertAt = lastItemIdx !== -1 ? lastItemIdx + 1 : insertAt
    // 在 insertAt 处插入新项
    const newLines = texts.map(t => `- [ ] ${t}`)
    lines.splice(insertAt, 0, ...newLines)
  } else {
    // 无待办段：寻找第一个 "## " 段前插入
    let firstH2 = -1
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) {
        firstH2 = i
        break
      }
    }
    const newLines = ['', '## 待办', '', ...texts.map(t => `- [ ] ${t}`), '']
    if (firstH2 !== -1) {
      lines.splice(firstH2, 0, ...newLines)
    } else {
      // 文件无任何二级标题：追加到末尾
      lines.push(...newLines)
    }
  }

  return lines.join('\n')
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
 * 按新的清单项顺序重写文件
 * - 接收一个完整的 items 数组（已按目标顺序排列）
 * - 把文件中所有"清单项行"按行号升序替换为新顺序的序列化文本
 * - 非清单行（标题、空行、备注等）保持原位不动
 *
 * 实现思路：
 *   文件中所有清单项的行号集合记为 itemLines（升序），
 *   新顺序数组的第 i 项写入 itemLines[i] 这一物理行。
 *
 * 注意：调用方需保证 newOrder 的长度等于文件中清单项总数，
 *      且不包含已删除的项。本函数不校验。
 */
export function reorderItems(
  parsed: ParsedMarkdown,
  newOrder: CheckItem[]
): string {
  const lines = parsed.lines.slice()
  // 收集所有当前识别为清单项的行号（升序）
  const itemLineIndices = parsed.items.map(i => i.lineIndex).sort((a, b) => a - b)
  // 逐行替换：第 i 个清单行写入 newOrder[i] 的序列化文本
  for (let i = 0; i < itemLineIndices.length && i < newOrder.length; i++) {
    lines[itemLineIndices[i]] = serializeItem(newOrder[i])
  }
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
