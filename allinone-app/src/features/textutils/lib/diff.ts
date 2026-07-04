// 文本对比核心逻辑
// 基于 diff-match-patch 的行级 diff 实现

import DiffMatchPatch from 'diff-match-patch'
import type { DiffLine } from '../types'

const dmp = new DiffMatchPatch()

/**
 * 计算两段文本的行级 diff
 * 利用 dmp 的 diff_linesToChars_ 预处理 + diff_main 实现行级对齐
 */
export function computeLineDiff(text1: string, text2: string): DiffLine[] {
  if (text1 === text2) {
    // 完全相同时直接返回 equal 行
    const lines = text1.split('\n')
    return lines.map((text, i) => ({
      type: 'equal' as const,
      text,
      leftNo: i + 1,
      rightNo: i + 1,
    }))
  }

  // dmp 行级预处理：把每行编码成单字符，再做 char-level diff
  // 注意：dmp 的类型声明把返回值标为对象，但实际是 [chars1, chars2, lineArray] 三元数组
  const lined = dmp.diff_linesToChars_(text1, text2) as unknown as [string, string, string[]]
  const diffChars = dmp.diff_main(lined[0], lined[1], false)
  dmp.diff_charsToLines_(diffChars, lined[2])
  dmp.diff_cleanupSemantic(diffChars)

  // 把 char-level diff 按 \n 切成行级块，并标注类型
  const result: DiffLine[] = []
  let leftNo = 1
  let rightNo = 1

  for (const [op, text] of diffChars) {
    if (text === '') continue
    // 按 \n 切分，保留空行（最后一行可能不带 \n）
    const parts = text.split('\n')
    // 如果 text 以 \n 结尾，split 会产生末尾空字符串，去掉它
    if (text.endsWith('\n')) parts.pop()

    for (const line of parts) {
      // dmp 操作符：-1=del, 1=insert, 0=equal
      if (op === -1) {
        result.push({ type: 'del', text: line, leftNo, rightNo: null })
        leftNo++
      } else if (op === 1) {
        result.push({ type: 'add', text: line, leftNo: null, rightNo })
        rightNo++
      } else {
        result.push({ type: 'equal', text: line, leftNo, rightNo })
        leftNo++
        rightNo++
      }
    }
  }

  return result
}

/** 统计差异行数 */
export function diffStats(lines: DiffLine[]): { added: number; deleted: number; unchanged: number } {
  let added = 0, deleted = 0, unchanged = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') deleted++
    else unchanged++
  }
  return { added, deleted, unchanged }
}
