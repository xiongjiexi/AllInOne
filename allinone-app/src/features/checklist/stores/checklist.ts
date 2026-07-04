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
  fileExists,
} from '../lib/fs'
import {
  parseMarkdown,
  serializeItem,
  replaceLine,
  extractUnchecked,
  reorderItems,
  appendItemsToTodo,
  buildChecklistContent,
  todayStr,
  nextDayStr,
  dateFromFilename,
  type ParsedMarkdown,
  type CheckItem,
} from '../lib/markdown'
import { isPinned, togglePin, pinKey } from '../lib/pin'
import { toggleFilePin, loadPinnedFiles } from '../lib/filePin'

const LS_FOLDER_PATH = 'allinone-checklist-folder-path'
const LS_CURRENT_FILE = 'allinone-checklist-current-file'

export interface FileMeta {
  name: string
  path: string
  date: string | null
}

export const useChecklistStore = defineStore('checklist', () => {
  // ===== state =====
  const folderPath = ref<string>(localStorage.getItem(LS_FOLDER_PATH) ?? '')
  const files = ref<FileMeta[]>([])
  const currentFileName = ref<string>('')
  const currentFilePath = ref<string>(localStorage.getItem(LS_CURRENT_FILE) ?? '')
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
   * - 已完成项保持在原位，不沉底
   */
  const displayItems = computed<CheckItem[]>(() => {
    const all = parsed.value.items
    const pinned: CheckItem[] = []
    const normal: CheckItem[] = []
    for (const it of all) {
      (isItemPinned(it) ? pinned : normal).push(it)
    }
    return [...pinned, ...normal]
  })

  // ===== actions =====

  /** 选择文件夹并加载文件列表 */
  async function chooseFolder(): Promise<boolean> {
    const dir = await pickFolder()
    if (!dir) return false
    folderPath.value = dir
    localStorage.setItem(LS_FOLDER_PATH, dir)
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
      localStorage.setItem(LS_CURRENT_FILE, path)
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

  /** 添加新待办（插入到 ## 待办 段落的最上方；若无则新建段） */
  async function addItem(text: string): Promise<void> {
    if (!hasCurrent.value) return
    const trimmed = text.trim()
    if (trimmed === '') return

    const lines = parsed.value.lines.slice()
    let insertAt = -1
    const todoHeaderRe = /^##\s+待办\s*$/
    for (let i = 0; i < lines.length; i++) {
      if (todoHeaderRe.test(lines[i])) {
        // 跳过段头后的空行，找到第一个清单项位置（或下一个二级标题前）
        let j = i + 1
        while (j < lines.length && lines[j].trim() === '') j++
        // 此时 j 指向段内第一个非空行；在该位置插入 = 段首
        insertAt = j
        break
      }
    }
    if (insertAt === -1) {
      // 无 ## 待办 段：新建段，新项为段内第一项
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
   * 上移一项：在 displayItems 视觉顺序中与前一项交换
   * - 第一项无效果（调用方应禁用按钮）
   * - 基于 displayItems 顺序回写文件，保证视觉与文件一致
   */
  async function moveItemUp(item: CheckItem): Promise<void> {
    if (!hasCurrent.value) return
    const ordered = displayItems.value.slice()
    const idx = ordered.findIndex(it => it.lineIndex === item.lineIndex)
    if (idx <= 0) return // 已是第一项
    // 交换 idx 与 idx-1
    ;[ordered[idx - 1], ordered[idx]] = [ordered[idx], ordered[idx - 1]]
    const newContent = reorderItems(parsed.value, ordered)
    parsed.value = parseMarkdown(newContent)
    currentContent.value = newContent
    dirty.value = true
    await persist()
  }

  /**
   * 下移一项：在 displayItems 视觉顺序中与后一项交换
   * - 最后一项无效果（调用方应禁用按钮）
   */
  async function moveItemDown(item: CheckItem): Promise<void> {
    if (!hasCurrent.value) return
    const ordered = displayItems.value.slice()
    const idx = ordered.findIndex(it => it.lineIndex === item.lineIndex)
    if (idx === -1 || idx >= ordered.length - 1) return // 已是最后一项
    ;[ordered[idx + 1], ordered[idx]] = [ordered[idx], ordered[idx + 1]]
    const newContent = reorderItems(parsed.value, ordered)
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
   * 在当前清单基础上新建下一份清单（下一天日期）
   * - 自动提取当前清单未完成项
   * - 迁移后旧清单保留
   * 保留以兼容旧调用点；新代码建议用 carryoverToToday / carryoverToNamed
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
      return await carryoverToBase(nextDate, `${nextDate}.md`)
    } catch (e: any) {
      errorMsg.value = `迁移新建失败: ${e?.message ?? e}`
      console.error('[createNextListWithCarryover]', e)
      return null
    }
  }

  /**
   * 迁移未完成项到【今日清单】
   * - 目标文件名：YYYY-MM-DD.md（今日）
   * - 若今日清单已存在，则直接把未完成项追加到该文件的"## 待办"段
   * - 若不存在则新建
   */
  async function carryoverToToday(): Promise<string | null> {
    if (!hasFolder.value) {
      errorMsg.value = '请先选择一个文件夹'
      return null
    }
    errorMsg.value = ''
    try {
      const today = todayStr()
      const baseName = `${today}.md`
      return await carryoverToBase(today, baseName)
    } catch (e: any) {
      errorMsg.value = `迁移到今日清单失败: ${e?.message ?? e}`
      console.error('[carryoverToToday]', e)
      return null
    }
  }

  /**
   * 迁移未完成项到【自定义命名清单】
   * - 与 createNamedList 的命名规则一致（清洗非法字符、补 .md）
   * - 目标清单不存在则新建；存在则追加未完成项到"## 待办"段
   */
  async function carryoverToNamed(rawName: string): Promise<string | null> {
    if (!hasFolder.value) {
      errorMsg.value = '请先选择一个文件夹'
      return null
    }
    errorMsg.value = ''
    try {
      const cleaned = rawName.trim()
      if (!cleaned) {
        errorMsg.value = '清单名称不能为空'
        return null
      }
      const safe = cleaned.replace(/[\\/:*?"<>|]/g, '_')
      const baseName = safe.toLowerCase().endsWith('.md') ? safe : `${safe}.md`
      const title = baseName.replace(/\.md$/i, '')
      return await carryoverToBase(title, baseName)
    } catch (e: any) {
      errorMsg.value = `迁移到自定义清单失败: ${e?.message ?? e}`
      console.error('[carryoverToNamed]', e)
      return null
    }
  }

  /**
   * 迁移核心：把当前清单未完成项写入目标清单
   * - 不存在则新建（含标题 + 未完成项 + 备注段）
   * - 已存在则把未完成项追加到"## 待办"段末尾
   * @param title 清单标题（用于新建时写入 # 标题）
   * @param baseName 文件名（含 .md）
   * @returns 新建/追加后的文件路径
   */
  async function carryoverToBase(title: string, baseName: string): Promise<string | null> {
    const uncheckedTexts = extractUnchecked(parsed.value).map(i => i.text)
    // 计算目标路径：若同名文件已存在则用 uniquePath 加后缀
    // 但"已存在则追加"语义要求：先判断是否已存在
    const directPath = await joinPath(folderPath.value, baseName)
    const exists = await fileExists(directPath)

    let targetPath: string
    let targetContent: string

    if (exists) {
      // 已存在：读取并追加未完成项到"## 待办"段末尾
      targetPath = directPath
      targetContent = await readMarkdown(directPath)
      const targetParsed = parseMarkdown(targetContent)
      const appended = appendItemsToTodo(targetParsed, uncheckedTexts)
      targetContent = appended
    } else {
      // 不存在：新建标准清单
      targetPath = directPath
      targetContent = buildChecklistContent(title, uncheckedTexts)
    }

    await writeMarkdown(targetPath, targetContent)
    await refreshFiles()
    const name = targetPath.split(/[\\/]/).pop() ?? baseName
    await openFile(targetPath, name)
    return targetPath
  }

  /**
   * 应用启动时从 localStorage 恢复上次状态
   * - 恢复文件夹并刷新文件列表
   * - 恢复上次打开的文件（若仍存在）
   * - 路径失效时静默清除，不阻塞启动
   */
  async function autoLoadLastState(): Promise<void> {
    if (!folderPath.value) return
    try {
      await refreshFiles()
    } catch (e) {
      // 文件夹失效，清空并退出
      folderPath.value = ''
      localStorage.removeItem(LS_FOLDER_PATH)
      localStorage.removeItem(LS_CURRENT_FILE)
      return
    }
    const lastFile = currentFilePath.value
    if (!lastFile) return
    // 校验上次文件仍在当前文件夹的文件列表中
    const exists = files.value.some(f => f.path === lastFile)
    if (!exists) {
      currentFilePath.value = ''
      localStorage.removeItem(LS_CURRENT_FILE)
      return
    }
    const name = lastFile.split(/[\\/]/).pop() ?? ''
    if (name) {
      try {
        await openFile(lastFile, name)
      } catch (e: any) {
        // 文件读取失败，清空但不阻塞
        currentFilePath.value = ''
        localStorage.removeItem(LS_CURRENT_FILE)
        console.error('[autoLoadLastState] openFile failed', e)
      }
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
    moveItemUp,
    moveItemDown,
    persist,
    createTodayList,
    createNamedList,
    createNextListWithCarryover,
    carryoverToToday,
    carryoverToNamed,
    autoLoadLastState,
  }
})
