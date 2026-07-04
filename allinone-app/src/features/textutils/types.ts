// 文本工具类型定义

/** 文本对比行的类型 */
export type DiffLineType = 'equal' | 'add' | 'del'

/** 单行对比结果 */
export interface DiffLine {
  type: DiffLineType
  text: string
  /** 左侧行号（del/equal 行有，add 行为 null） */
  leftNo: number | null
  /** 右侧行号（add/equal 行有，del 行为 null） */
  rightNo: number | null
}
