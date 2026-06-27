// 清单状态管理
// 管理当前文件夹、文件列表、当前打开的清单内容

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listMarkdownFiles,
  readMarkdown,
  writeMarkdown,
  pickFolder,
  joinPath,
  uniquePath,
} from '../lib/fs'
import {
  parseMarkdown,
  serializeItem,
  replaceLine,
  extractUnchecked,
  moveItemLine,
  buildChecklistContent,
  todayStr,
  nextDayStr,
  dateFromFilename,
  type ParsedMarkdown,
  type CheckItem,
} from '../lib/markdown'
import { isPinned, togglePin, pinKey } from '../lib/pin'
import { toggleFilePin, loadPinnedFiles } from '../lib/filePin'

export interface FileMeta {
  name: string
  path: string
  date: string | null
}

export const useChecklistStore = defineStore('checklist', () => {
  // ===== state =====
  const folderPath = ref<string>('')
  const files = ref<FileMeta[]>([])
  const currentFileName = ref<string>('')
  const currentFilePath = ref<string>('')
  const currentContent = ref<string>('')
  const parsed = ref<ParsedMarkdown>({ lines: [], items: [] })
  const loading = ref<boolean>(false)
  const errorMsg = ref<string>('')
  const dirty = ref<boolean>(false)
  // 置顶项指纹集合（响应式，切换置顶时刷新以触发重排）
  const pinnedKeys = ref<Set<string>>(new Set())
  // 置顶文件路径集合（响应式，切换时刷新以触发文件列表重排）
  const pinnedFiles = ref<Set<string>>(new Set())

  // ===== getters =====
  const items = computed<CheckItem[]>(() => parsed.value.items)
  const uncheckedCount = computed(() => parsed.value.items.filter(i => !i.checked).length)
  const checkedCount = computed(() => parsed.value.items.filter(i => i.checked).length)
  const hasFolder = computed(() => folderPath.value !== '')
  const hasCurrent = computed(() => currentFilePath.value !== '')

  /**
   * 展示用文件列表：置顶文件排在前（保持原相对顺序），其余按原顺序在后
   * - 不修改 md 文件，置顶状态仅存 localStorage
   */
  const displayFiles = computed<FileMeta[]>(() => {
    const all = files.value
    const pinned: FileMeta[] = []
    const normal: FileMeta[] = []
    for (const f of all) {
      if (pinnedFiles.value.has(f.path)) pinned.push(f)
      else normal.push(f)
    }
    return [...pinned, ...normal]
  })

  /** 文件是否被置顶 */
  function isFilePinnedState(path: string): boolean {
    return pinnedFiles.value.has(path)
  }

  /** 是否置顶（按文件路径+文本指纹判断，不侵入 md） */
  function isItemPinned(item: CheckItem): boolean {
    if (!currentFilePath.value) return false
    return pinnedKeys.value.has(pinKey(currentFilePath.value, item.text))
  }

  /**
   * 展示用列表：置顶项排在前（保持原相对顺序），其余按原顺序在后
   * - 已完成项始终沉到底部，避免置顶的已完成项霸占顶部
   */
  const displayItems = computed<CheckItem[]>(() => {
    const all = parsed.value.items
    const pinned: CheckItem[] = []
    const normal: CheckItem[] = []
    const donePinned: CheckItem[] = []
    const doneNormal: CheckItem[] = []
    for (const it of all) {
      const isP = isItemPinned(it)
      if (it.checked) {
        (isP ? donePinned : doneNormal).push(it)
      } else {
        (isP ? pinned : normal).push(it)
      }
    }
    return [...pinned, ...normal, ...donePinned, ...doneNormal]
  })

  // ===== actions =====

  /** 选择文件夹并加载文件列表 */
  async function chooseFolder(): Promise<boolean> {
    const dir = await pickFolder()
    if (!dir) return false
    folderPath.value = dir
    await refreshFiles()
    return true
  }

  /** 重新扫描当前文件夹 */
  async function refreshFiles(): Promise<void> {
    if (!folderPath.value) return
    loading.value = true
    errorMsg.value = ''
    try {
      // listMarkdownFiles 现在返回文件名字符串数组
      const names = await listMarkdownFiles(folderPath.value)
      const metas: FileMeta[] = []
      for (const name of names) {
        const path = await joinPath(folderPath.value, name)
        metas.push({
          name,
          path,
          date: dateFromFilename(name),
        })
      }
      files.value = metas
      // 刷新置顶文件集合（仅保留当前文件夹下确实存在的文件）
      const allPinned = loadPinnedFiles()
      const next = new Set<string>()
      for (const m of metas) {
        if (allPinned.has(m.path)) next.add(m.path)
      }
      pinnedFiles.value = next
    } catch (e: any) {
      errorMsg.value = `读取文件夹失败: ${e?.message ?? e}`
      console.error('[refreshFiles]', e)
    } finally {
      loading.value = false
    }
  }

  /** 切换文件置顶状态（不修改 md 文件，仅写 localStorage） */
  function toggleFilePinState(path: string): boolean {
    const next = toggleFilePin(path)
    const s = new Set(pinnedFiles.value)
    if (next) s.add(path)
    else s.delete(path)
    pinnedFiles.value = s
    return next
  }

  /** 新建自定义命名清单 */
  async function createNamedList(rawName: string): Promise<string | null> {
    if (!hasFolder.value) {
      errorMsg.value = '请先选择一个文件夹'
      return null
    }
    errorMsg.value = ''
    try {
      // 清洗名称：去除首尾空白、去除非法字符、补 .md 后缀
      const cleaned = rawName.trim()
      if (!cleaned) {
        errorMsg.value = '清单名称不能为空'
        return null
      }
      const safe = cleaned.replace(/[\\/:*?"<>|]/g, '_')
      const baseName = safe.toLowerCase().endsWith('.md') ? safe : `${safe}.md`
      const path = await uniquePath(folderPath.value, baseName)
      const name = path.split(/[\\/]/).pop() ?? baseName
      // 标题用去掉扩展名的名称
      const title = name.replace(/\.md$/i, '')
      const content = buildChecklistContent(title)
      await writeMarkdown(path, content)
      await refreshFiles()
      await openFile(path, name)
      return path
    } catch (e: any) {
      errorMsg.value = `新建清单失败: ${e?.message ?? e}`
      console.error('[createNamedList]', e)
      return null
    }
  }

  /** 打开指定文件 */
  async function openFile(path: string, name: string): Promise<void> {
    loading.value = true
    errorMsg.value = ''
    try {
      const content = await readMarkdown(path)
      currentFilePath.value = path
      currentFileName.value = name
      currentContent.value = content
      parsed.value = parseMarkdown(content)
      dirty.value = false
      // 刷新置顶指纹集合（基于当前文件路径）
      const next = new Set<string>()
      for (const it of parsed.value.items) {
        if (isPinned(path, it.text)) next.add(pinKey(path, it.text))
      }
      pinnedKeys.value = next
    } catch (e: any) {
      errorMsg.value = `打开文件失败: ${e?.message ?? e}`
      console.error('[openFile]', e)
    } finally {
      loading.value = false
    }
  }

  /** 切换某项的置顶状态（不修改 md 文件，仅写 localStorage） */
  function toggleItemPin(item: CheckItem): boolean {
    if (!currentFilePath.value) return false
    const next = togglePin(currentFilePath.value, item.text)
    const s = new Set(pinnedKeys.value)
    const key = pinKey(currentFilePath.value, item.text)
    if (next) s.add(key)
    else s.delete(key)
    pinnedKeys.value = s
    return next
  }

  /** 切换某项勾选状态并回写文件 */
  async function toggleItem(item: CheckItem): Promise<void> {
    if (!hasCurrent.value) return
    const updated: CheckItem = { ...item, checked: !item.checked }
    const newLine = serializeItem(updated)
    const newContent = replaceLine(parsed.value, item.lineIndex, newLine)
    parsed.value.lines[item.lineIndex] = newLine
    const target = parsed.value.items.find(i => i.lineIndex === item.lineIndex)
    if (target) target.checked = updated.checked
    currentContent.value = newContent
    dirty.value = true
    await persist()
  }

  /** 编辑某项文本 */
  async function editItemText(item: CheckItem, newText: string): Promise<void> {
    if (!hasCurrent.value) return
    const trimmed = newText.trim()
    if (trimmed === '') return
    const updated: CheckItem = { ...item, text: trimmed }
    const newLine = serializeItem(updated)
    const newContent = replaceLine(parsed.value, item.lineIndex, newLine)
    parsed.value.lines[item.lineIndex] = newLine
    const target = parsed.value.items.find(i => i.lineIndex === item.lineIndex)
    if (target) target.text = trimmed
    currentContent.value = newContent
    dirty.value = true
    await persist()
  }

  /** 添加新待办（追加到第一个 ## 待办 段落之后；若无则追加到文件末尾） */
  async function addItem(text: string): Promise<void> {
    if (!hasCurrent.value) return
    const trimmed = text.trim()
    if (trimmed === '') return

    const lines = parsed.value.lines.slice()
    let insertAt = -1
    const todoHeaderRe = /^##\s+待办\s*$/
    for (let i = 0; i < lines.length; i++) {
      if (todoHeaderRe.test(lines[i])) {
        let j = i + 1
        while (j < lines.length && lines[j].trim() === '') j++
        while (j < lines.length && !/^##\s+/.test(lines[j])) j++
        insertAt = j
        break
      }
    }
    if (insertAt === -1) {
      lines.push('')
      lines.push('## 待办')
      lines.push('')
      insertAt = lines.length
    }
    lines.splice(insertAt, 0, `- [ ] ${trimmed}`)

    const newContent = lines.join('\n')
    parsed.value = parseMarkdown(newContent)
    currentContent.value = newContent
    dirty.value = true
    await persist()
  }

  /** 删除某项 */
  async function deleteItem(item: CheckItem): Promise<void> {
    if (!hasCurrent.value) return
    const lines = parsed.value.lines.slice()
    lines.splice(item.lineIndex, 1)
    const newContent = lines.join('\n')
    parsed.value = parseMarkdown(newContent)
    currentContent.value = newContent
    dirty.value = true
    await persist()
  }

  /**
   * 拖拽排序：把 fromItem 移动到 toItem 之前或之后
   * - 在文件的物理行层面搬移该清单项的整行
   * - 重新解析后 displayItems 会自然按新顺序 + 置顶/完成规则重排
   * @param position 'before' 插到目标项前 / 'after' 插到目标项后
   */
  async function moveItem(
    fromItem: CheckItem,
    toItem: CheckItem,
    position: 'before' | 'after'
  ): Promise<void> {
    if (!hasCurrent.value) return
    if (fromItem.lineIndex === toItem.lineIndex) return
    const newContent = moveItemLine(parsed.value, fromItem.lineIndex, toItem.lineIndex, position)
    parsed.value = parseMarkdown(newContent)
    currentContent.value = newContent
    dirty.value = true
    await persist()
  }

  /** 持久化当前内容到磁盘 */
  async function persist(): Promise<void> {
    if (!hasCurrent.value) return
    try {
      await writeMarkdown(currentFilePath.value, currentContent.value)
      dirty.value = false
    } catch (e: any) {
      errorMsg.value = `保存失败: ${e?.message ?? e}`
      console.error('[persist]', e)
    }
  }

  /** 新建当天日期清单 */
  async function createTodayList(): Promise<string | null> {
    if (!hasFolder.value) {
      errorMsg.value = '请先选择一个文件夹'
      return null
    }
    errorMsg.value = ''
    try {
      const today = todayStr()
      const baseName = `${today}.md`
      const path = await uniquePath(folderPath.value, baseName)
      const name = path.split(/[\\/]/).pop() ?? baseName
      const content = buildChecklistContent(today)
      await writeMarkdown(path, content)
      await refreshFiles()
      await openFile(path, name)
      return path
    } catch (e: any) {
      errorMsg.value = `新建清单失败: ${e?.message ?? e}`
      console.error('[createTodayList]', e)
      return null
    }
  }

  /**
   * 在当前清单基础上新建下一份清单
   * - 自动提取当前清单未完成项
   * - 迁移后旧清单保留（用户决策）
   */
  async function createNextListWithCarryover(): Promise<string | null> {
    if (!hasFolder.value) {
      errorMsg.value = '请先选择一个文件夹'
      return null
    }
    errorMsg.value = ''
    try {
      const currentDate = currentFileName.value
        ? dateFromFilename(currentFileName.value)
        : null
      const nextDate = currentDate ? nextDayStr(currentDate) : todayStr()
      const baseName = `${nextDate}.md`
      const path = await uniquePath(folderPath.value, baseName)
      const name = path.split(/[\\/]/).pop() ?? baseName

      const unchecked = extractUnchecked(parsed.value).map(i => i.text)
      const content = buildChecklistContent(nextDate, unchecked)
      await writeMarkdown(path, content)
      await refreshFiles()
      await openFile(path, name)
      return path
    } catch (e: any) {
      errorMsg.value = `迁移新建失败: ${e?.message ?? e}`
      console.error('[createNextListWithCarryover]', e)
      return null
    }
  }

  return {
    // state
    folderPath,
    files,
    currentFileName,
    currentFilePath,
    currentContent,
    parsed,
    loading,
    errorMsg,
    dirty,
    pinnedKeys,
    pinnedFiles,
    // getters
    items,
    displayItems,
    displayFiles,
    uncheckedCount,
    checkedCount,
    hasFolder,
    hasCurrent,
    isItemPinned,
    isFilePinnedState,
    // actions
    chooseFolder,
    refreshFiles,
    openFile,
    toggleItem,
    toggleItemPin,
    toggleFilePinState,
    editItemText,
    addItem,
    deleteItem,
    moveItem,
    persist,
    createTodayList,
    createNamedList,
    createNextListWithCarryover,
  }
})
