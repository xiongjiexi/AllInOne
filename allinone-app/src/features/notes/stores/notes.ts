// 笔记工具状态管理
// 管理当前文件夹、文件列表、当前打开的笔记内容、编辑/阅读模式

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listMarkdownFilesWithMeta,
  readTextFile,
  writeTextFile,
  pickFolder,
  joinPath,
  uniquePath,
  fileExists,
  renameFile,
  deleteFile,
  fileMtime,
  type MdFileEntry,
} from '../lib/fs'
import { isFilePinned, toggleFilePin, loadPinnedFiles } from '../lib/filePin'

const LS_FOLDER_PATH = 'allinone-notes-folder-path'
const LS_CURRENT_FILE = 'allinone-notes-current-file'
const LS_MODE = 'allinone-notes-mode'

export type NoteMode = 'read' | 'edit'

export interface NoteFileMeta extends MdFileEntry {
  path: string
  isPinned: boolean
}

export const useNotesStore = defineStore('notes', () => {
  // ===== state =====
  const folderPath = ref<string>(localStorage.getItem(LS_FOLDER_PATH) ?? '')
  const files = ref<NoteFileMeta[]>([])
  const currentFilePath = ref<string>(localStorage.getItem(LS_CURRENT_FILE) ?? '')
  const currentFileName = ref<string>('')
  const currentContent = ref<string>('')     // 当前 md 内容（编辑态权威源）
  const savedContent = ref<string>('')        // 已保存到磁盘的快照（用于 dirty 判断）
  const lastLoadedMtime = ref<number>(0)      // 打开时记录的文件 mtime（用于冲突检测）
  const mode = ref<NoteMode>(localStorage.getItem(LS_MODE) === 'edit' ? 'edit' : 'read')
  const loading = ref<boolean>(false)
  const errorMsg = ref<string>('')
  const searchKeyword = ref<string>('')

  // ===== getters =====
  const hasFolder = computed(() => folderPath.value !== '')
  const hasCurrent = computed(() => currentFilePath.value !== '')
  const dirty = computed(() => currentContent.value !== savedContent.value)
  const wordCount = computed(() => {
    const text = currentContent.value.trim()
    if (!text) return 0
    // 中文按字算，英文按词算，取近似值
    const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const en = (text.replace(/[\u4e00-\u9fa5]/g, ' ').trim().match(/\S+/g) || []).length
    return cjk + en
  })

  /**
   * 展示用文件列表：置顶在前 → 修改时间倒序
   * 支持按文件名搜索过滤（不区分大小写）
   */
  const displayFiles = computed<NoteFileMeta[]>(() => {
    const kw = searchKeyword.value.trim().toLowerCase()
    const list = kw
      ? files.value.filter(f => f.name.toLowerCase().includes(kw))
      : files.value
    const pinned: NoteFileMeta[] = []
    const normal: NoteFileMeta[] = []
    for (const f of list) {
      (f.isPinned ? pinned : normal).push(f)
    }
    // 置顶区内仍按修改时间倒序；普通区按修改时间倒序
    pinned.sort((a, b) => b.mtime - a.mtime)
    normal.sort((a, b) => b.mtime - a.mtime)
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
      const entries = await listMarkdownFilesWithMeta(folderPath.value)
      const allPinned = loadPinnedFiles()
      files.value = entries.map(e => ({
        ...e,
        path: '',  // 稍后填充
        isPinned: false,
      }))
      // 拼接 path（await 需要 for-of）
      for (let i = 0; i < entries.length; i++) {
        const path = await joinPath(folderPath.value, entries[i].name)
        files.value[i].path = path
        files.value[i].isPinned = allPinned.has(path)
      }
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
    const f = files.value.find(x => x.path === path)
    if (f) f.isPinned = next
    return next
  }

  /** 新建笔记 */
  async function createNote(rawName: string): Promise<string | null> {
    if (!hasFolder.value) {
      errorMsg.value = '请先选择一个文件夹'
      return null
    }
    errorMsg.value = ''
    try {
      const cleaned = rawName.trim()
      if (!cleaned) {
        errorMsg.value = '笔记名称不能为空'
        return null
      }
      const safe = cleaned.replace(/[\\/:*?"<>|]/g, '_')
      const baseName = safe.toLowerCase().endsWith('.md') ? safe : `${safe}.md`
      const path = await uniquePath(folderPath.value, baseName)
      const name = path.split(/[\\/]/).pop() ?? baseName
      // 空笔记：仅写入一个一级标题（用文件名作为标题）
      const title = name.replace(/\.md$/i, '')
      const content = `# ${title}\n\n`
      await writeTextFile(path, content)
      await refreshFiles()
      await openFile(path)
      // 新建后自动进入编辑模式，方便立即书写
      mode.value = 'edit'
      localStorage.setItem(LS_MODE, 'edit')
      return path
    } catch (e: any) {
      errorMsg.value = `新建笔记失败: ${e?.message ?? e}`
      console.error('[createNote]', e)
      return null
    }
  }

  /** 打开指定文件 */
  async function openFile(path: string): Promise<void> {
    loading.value = true
    errorMsg.value = ''
    try {
      const content = await readTextFile(path)
      currentFilePath.value = path
      currentFileName.value = path.split(/[\\/]/).pop() ?? ''
      currentContent.value = content
      savedContent.value = content
      try {
        lastLoadedMtime.value = await fileMtime(path)
      } catch {
        lastLoadedMtime.value = 0
      }
      localStorage.setItem(LS_CURRENT_FILE, path)
    } catch (e: any) {
      errorMsg.value = `打开文件失败: ${e?.message ?? e}`
      console.error('[openFile]', e)
    } finally {
      loading.value = false
    }
  }

  /** 更新当前内容（编辑器 onChange 调用，不立即保存） */
  function setCurrentContent(content: string): void {
    currentContent.value = content
  }

  /** 切换模式：edit→read 时自动保存 */
  async function switchMode(m: NoteMode): Promise<void> {
    if (m === mode.value) return
    if (m === 'read' && dirty.value) {
      await persist()
    }
    mode.value = m
    localStorage.setItem(LS_MODE, m)
  }

  /** 持久化当前内容到磁盘（含冲突检测） */
  async function persist(): Promise<boolean> {
    if (!hasCurrent.value) return false
    try {
      // 冲突检测：文件在外部被修改且本地也有改动
      if (lastLoadedMtime.value > 0) {
        const currentMtime = await fileMtime(currentFilePath.value)
        if (currentMtime > lastLoadedMtime.value && currentContent.value !== savedContent.value) {
          const overwrite = confirm(
            '文件已被外部程序修改，保存将覆盖外部修改。是否继续？\n\n' +
            `本地最后保存: ${new Date(savedContent.value === currentContent.value ? lastLoadedMtime.value : Date.now()).toLocaleString()}\n` +
            `外部修改时间: ${new Date(currentMtime).toLocaleString()}`
          )
          if (!overwrite) return false
        }
      }
      await writeTextFile(currentFilePath.value, currentContent.value)
      savedContent.value = currentContent.value
      lastLoadedMtime.value = Date.now()
      // 刷新侧边栏的修改时间
      await refreshFiles()
      return true
    } catch (e: any) {
      errorMsg.value = `保存失败: ${e?.message ?? e}`
      console.error('[persist]', e)
      return false
    }
  }

  /** 重命名笔记（P1） */
  async function renameNote(oldPath: string, newName: string): Promise<boolean> {
    errorMsg.value = ''
    try {
      const cleaned = newName.trim()
      if (!cleaned) {
        errorMsg.value = '名称不能为空'
        return false
      }
      const safe = cleaned.replace(/[\\/:*?"<>|]/g, '_')
      const finalName = safe.toLowerCase().endsWith('.md') ? safe : `${safe}.md`
      // 同名检查
      const newPath = await joinPath(folderPath.value, finalName)
      if (newPath !== oldPath && await fileExists(newPath)) {
        errorMsg.value = `已存在同名文件: ${finalName}`
        return false
      }
      await renameFile(oldPath, finalName)
      // 若重命名的是当前打开的文件，更新引用
      if (oldPath === currentFilePath.value) {
        currentFilePath.value = newPath
        currentFileName.value = finalName
        localStorage.setItem(LS_CURRENT_FILE, newPath)
        // 同步置顶状态迁移
        if (isFilePinned(oldPath)) {
          toggleFilePin(oldPath)  // 取消旧
          toggleFilePin(newPath)  // 置顶新
        }
      } else if (isFilePinned(oldPath)) {
        // 非当前文件也要迁移置顶状态
        toggleFilePin(oldPath)
        toggleFilePin(newPath)
      }
      await refreshFiles()
      return true
    } catch (e: any) {
      errorMsg.value = `重命名失败: ${e?.message ?? e}`
      console.error('[renameNote]', e)
      return false
    }
  }

  /** 删除笔记（P1） */
  async function deleteNote(path: string): Promise<boolean> {
    errorMsg.value = ''
    try {
      await deleteFile(path)
      // 清理置顶状态
      if (isFilePinned(path)) toggleFilePin(path)
      // 若删除的是当前文件，清空当前引用
      if (path === currentFilePath.value) {
        currentFilePath.value = ''
        currentFileName.value = ''
        currentContent.value = ''
        savedContent.value = ''
        lastLoadedMtime.value = 0
        localStorage.removeItem(LS_CURRENT_FILE)
      }
      await refreshFiles()
      return true
    } catch (e: any) {
      errorMsg.value = `删除失败: ${e?.message ?? e}`
      console.error('[deleteNote]', e)
      return false
    }
  }

  /** 应用启动时从 localStorage 恢复上次状态 */
  async function autoLoadLastState(): Promise<void> {
    if (!folderPath.value) return
    try {
      await refreshFiles()
    } catch (e) {
      folderPath.value = ''
      localStorage.removeItem(LS_FOLDER_PATH)
      localStorage.removeItem(LS_CURRENT_FILE)
      return
    }
    const lastFile = currentFilePath.value
    if (!lastFile) return
    const exists = files.value.some(f => f.path === lastFile)
    if (!exists) {
      currentFilePath.value = ''
      localStorage.removeItem(LS_CURRENT_FILE)
      return
    }
    try {
      await openFile(lastFile)
    } catch (e: any) {
      currentFilePath.value = ''
      localStorage.removeItem(LS_CURRENT_FILE)
      console.error('[autoLoadLastState] openFile failed', e)
    }
  }

  return {
    // state
    folderPath,
    files,
    currentFilePath,
    currentFileName,
    currentContent,
    savedContent,
    lastLoadedMtime,
    mode,
    loading,
    errorMsg,
    searchKeyword,
    // getters
    hasFolder,
    hasCurrent,
    dirty,
    wordCount,
    displayFiles,
    // actions
    chooseFolder,
    refreshFiles,
    toggleFilePinState,
    createNote,
    openFile,
    setCurrentContent,
    switchMode,
    persist,
    renameNote,
    deleteNote,
    autoLoadLastState,
  }
})
