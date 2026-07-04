<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useChecklistStore } from '../stores/checklist'
import { openInExplorer } from '../lib/fs'
import type { FileMeta } from '../stores/checklist'

const store = useChecklistStore()

async function onChooseFolder() {
  await store.chooseFolder()
}

async function onRefresh() {
  await store.refreshFiles()
}

async function onOpen(path: string, name: string) {
  await store.openFile(path, name)
}

async function onCreateToday() {
  await store.createTodayList()
}

async function onCreateNamed() {
  // 用原生 prompt 接收名称；取消则什么都不做
  const name = window.prompt('请输入清单名称（无需 .md 后缀）：')
  if (name === null) return
  await store.createNamedList(name)
}

function onTogglePin(path: string, e: MouseEvent) {
  e.stopPropagation()
  store.toggleFilePinState(path)
}

// ===== 右键上下文菜单 =====
// 自定义浮层菜单：打开所在文件夹（在资源管理器中打开并选中）
const ctxMenu = ref<{ visible: boolean; x: number; y: number; file: FileMeta | null }>({
  visible: false,
  x: 0,
  y: 0,
  file: null,
})

function onFileContextmenu(file: FileMeta, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  // 防止菜单超出窗口右下边界（菜单宽约 200、高约 48）
  const menuW = 200, menuH = 48
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
  ctxMenu.value = { visible: true, x, y, file }
}

function closeCtxMenu() {
  ctxMenu.value.visible = false
  ctxMenu.value.file = null
}

async function onCtxOpenFolder() {
  const f = ctxMenu.value.file
  closeCtxMenu()
  if (!f) return
  try {
    await openInExplorer(f.path)
  } catch (e: any) {
    alert(`打开文件夹失败: ${e?.message ?? e}`)
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
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="title">清单</span>
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
      <div class="create-row">
        <button
          class="btn btn-block"
          :disabled="!store.hasFolder"
          @click="onCreateToday"
          title="新建当天日期清单（文件名 YYYY-MM-DD.md）"
        >
          ＋ 今日
        </button>
        <button
          class="btn btn-block"
          :disabled="!store.hasFolder"
          @click="onCreateNamed"
          title="新建自定义命名清单"
        >
          ＋ 自定义
        </button>
      </div>
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
        文件夹内暂无 .md 文件
      </div>
      <ul v-else>
        <li
          v-for="f in store.displayFiles"
          :key="f.path"
          :class="['file-item', { active: f.path === store.currentFilePath, pinned: store.isFilePinnedState(f.path) }]"
          @click="onOpen(f.path, f.name)"
          @contextmenu="onFileContextmenu(f, $event)"
          :title="f.name"
        >
          <span class="file-icon">{{ store.isFilePinnedState(f.path) ? '📌' : '📄' }}</span>
          <span class="file-name">{{ f.name.replace(/\.md$/i, '') }}</span>
          <button
            class="btn-icon btn-ghost pin-btn"
            :class="{ active: store.isFilePinnedState(f.path) }"
            :title="store.isFilePinnedState(f.path) ? '取消置顶' : '置顶清单'"
            @click="onTogglePin(f.path, $event)"
          >
            {{ store.isFilePinnedState(f.path) ? '★' : '☆' }}
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
      <div class="ctx-item" @click="onCtxOpenFolder">
        <span class="ctx-icon">📁</span>
        <span>打开所在文件夹</span>
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
.create-row {
  display: flex;
  gap: 6px;
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
/* 置顶文件：浅色背景 + 左侧蓝色条 */
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
.file-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.ctx-icon {
  font-size: 14px;
  width: 16px;
  text-align: center;
}
</style>
