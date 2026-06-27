<script setup lang="ts">
import { useChecklistStore } from '../stores/checklist'

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
</style>
