<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useNotesStore, type NoteFileMeta } from '../stores/notes'
import { openInExplorer } from '../lib/fs'

const store = useNotesStore()

async function onChooseFolder() {
  await store.chooseFolder()
}

async function onRefresh() {
  await store.refreshFiles()
}

async function onOpen(file: NoteFileMeta) {
  await store.openFile(file.path)
}

async function onCreate() {
  const name = window.prompt('请输入笔记名称（无需 .md 后缀）：')
  if (name === null) return
  await store.createNote(name)
}

function onTogglePin(path: string, e: MouseEvent) {
  e.stopPropagation()
  store.toggleFilePinState(path)
}

// ===== 右键上下文菜单 =====
type CtxAction = 'open-folder' | 'rename' | 'delete'
const ctxMenu = ref<{ visible: boolean; x: number; y: number; file: NoteFileMeta | null }>({
  visible: false,
  x: 0,
  y: 0,
  file: null,
})

function onFileContextmenu(file: NoteFileMeta, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const menuW = 200, menuH = 120
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
  ctxMenu.value = { visible: true, x, y, file }
}

function closeCtxMenu() {
  ctxMenu.value.visible = false
  ctxMenu.value.file = null
}

async function onCtxAction(action: CtxAction) {
  const f = ctxMenu.value.file
  closeCtxMenu()
  if (!f) return

  if (action === 'open-folder') {
    try {
      await openInExplorer(f.path)
    } catch (e: any) {
      alert(`打开文件夹失败: ${e?.message ?? e}`)
    }
  } else if (action === 'rename') {
    const oldName = f.name.replace(/\.md$/i, '')
    const newName = window.prompt('请输入新名称（无需 .md 后缀）：', oldName)
    if (newName === null) return
    await store.renameNote(f.path, newName)
  } else if (action === 'delete') {
    if (!confirm(`确认删除笔记「${f.name}」？\n此操作不可恢复。`)) return
    await store.deleteNote(f.path)
  }
}

function onDocClick() {
  if (ctxMenu.value.visible) closeCtxMenu()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ctxMenu.value.visible) closeCtxMenu()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})

// 格式化修改时间：今天显示"今天 HH:MM"，其他显示日期
function formatTime(mtime: number): string {
  if (!mtime) return ''
  const d = new Date(mtime)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="title">笔记</span>
      <div class="actions">
        <button class="btn-icon btn-ghost" title="刷新" :disabled="!store.hasFolder" @click="onRefresh">
          ↻
        </button>
      </div>
    </div>

    <div class="sidebar-actions">
      <button class="btn btn-primary btn-block" @click="onChooseFolder">
        📁 选择文件夹
      </button>
      <button
        class="btn btn-block"
        :disabled="!store.hasFolder"
        @click="onCreate"
        title="新建笔记"
      >
        ＋ 新建笔记
      </button>
      <!-- 文件名搜索（P1） -->
      <input
        v-if="store.hasFolder"
        v-model="store.searchKeyword"
        class="search-input"
        placeholder="搜索笔记名…"
        type="text"
      />
    </div>

    <div v-if="store.folderPath" class="folder-path" :title="store.folderPath">
      {{ store.folderPath }}
    </div>

    <div class="file-list">
      <div v-if="store.loading" class="file-list-hint">加载中…</div>
      <div v-else-if="!store.hasFolder" class="file-list-hint">
        请先选择一个文件夹
      </div>
      <div v-else-if="store.displayFiles.length === 0" class="file-list-hint">
        {{ store.searchKeyword ? '无匹配笔记' : '文件夹内暂无 .md 文件' }}
      </div>
      <ul v-else>
        <li
          v-for="f in store.displayFiles"
          :key="f.path"
          :class="['file-item', { active: f.path === store.currentFilePath, pinned: f.isPinned }]"
          @click="onOpen(f)"
          @contextmenu="onFileContextmenu(f, $event)"
          :title="f.name"
        >
          <span class="file-icon">{{ f.isPinned ? '📌' : '📄' }}</span>
          <div class="file-info">
            <span class="file-name">{{ f.name.replace(/\.md$/i, '') }}</span>
            <span class="file-meta">{{ formatTime(f.mtime) }}</span>
          </div>
          <button
            class="btn-icon btn-ghost pin-btn"
            :class="{ active: f.isPinned }"
            :title="f.isPinned ? '取消置顶' : '置顶笔记'"
            @click="onTogglePin(f.path, $event)"
          >
            {{ f.isPinned ? '★' : '☆' }}
          </button>
        </li>
      </ul>
    </div>

    <!-- 右键上下文菜单 -->
    <div
      v-if="ctxMenu.visible && ctxMenu.file"
      class="ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
    >
      <div class="ctx-item" @click="onCtxAction('open-folder')">
        <span class="ctx-icon">📁</span>
        <span>打开所在文件夹</span>
      </div>
      <div class="ctx-item" @click="onCtxAction('rename')">
        <span class="ctx-icon">✏️</span>
        <span>重命名</span>
      </div>
      <div class="ctx-item ctx-danger" @click="onCtxAction('delete')">
        <span class="ctx-icon">🗑️</span>
        <span>删除</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 8px;
}
.sidebar-header .title {
  font-weight: 600;
  font-size: 15px;
}
.sidebar-header .actions {
  display: flex;
  gap: 2px;
}

.sidebar-actions {
  padding: 4px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.btn-block {
  width: 100%;
  justify-content: center;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.search-input:focus {
  border-color: var(--accent);
}

.folder-path {
  padding: 6px 14px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
.file-list-hint {
  padding: 16px 14px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-soft);
  border-left: 2px solid transparent;
  transition: background 0.1s;
  position: relative;
}
.file-item:hover {
  background: var(--bg-soft);
}
.file-item.active {
  background: var(--accent-soft);
  color: var(--text);
  border-left-color: var(--accent);
}
.file-item.pinned {
  background: var(--accent-soft);
  border-left-color: var(--accent);
}
.file-item.pinned:hover {
  background: var(--accent-soft);
}
.file-icon {
  font-size: 12px;
  opacity: 0.8;
}
.file-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.file-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-meta {
  font-size: 11px;
  color: var(--text-muted);
}
.pin-btn {
  font-size: 11px;
  opacity: 0;
  padding: 2px 4px;
  transition: opacity 0.15s, color 0.15s;
  color: var(--text-muted);
}
.file-item:hover .pin-btn,
.pin-btn.active {
  opacity: 1;
}
.pin-btn:hover {
  color: var(--accent);
}
.pin-btn.active {
  color: var(--accent);
}

/* 右键上下文菜单 */
.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 4px;
  animation: ctxFadeIn 0.12s ease-out;
}
@keyframes ctxFadeIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
  transition: background 0.1s;
}
.ctx-item:hover {
  background: var(--accent-soft);
}
.ctx-item.ctx-danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.ctx-icon {
  font-size: 14px;
  width: 16px;
  text-align: center;
}
</style>
