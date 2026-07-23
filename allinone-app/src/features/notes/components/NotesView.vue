<script setup lang="ts">
import { computed } from 'vue'
import { useNotesStore } from '../stores/notes'
import NoteEditor from './NoteEditor.vue'
import NoteReader from './NoteReader.vue'

const store = useNotesStore()

const title = computed(() => {
  if (!store.hasCurrent) return '笔记'
  return store.currentFileName.replace(/\.md$/i, '')
})

async function onSwitchMode(m: 'read' | 'edit') {
  await store.switchMode(m)
}

// 格式化时间戳为本地可读字符串
function formatTime(mtime: number): string {
  if (!mtime) return ''
  const d = new Date(mtime)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}
</script>

<template>
  <main class="notes-view">
    <!-- 顶部标题区 -->
    <header class="view-header">
      <div class="title-area">
        <h1 class="title">{{ title }}</h1>
        <div class="stats" v-if="store.hasCurrent">
          <span class="stat-pill">{{ store.wordCount }} 字</span>
          <span class="stat-pill" v-if="store.lastLoadedMtime">
            {{ formatTime(store.lastLoadedMtime) }}
          </span>
          <span class="stat-pill dirty" v-if="store.dirty" title="未保存">
            ● 未保存
          </span>
        </div>
      </div>
      <div class="header-actions" v-if="store.hasCurrent">
        <div class="mode-switcher">
          <button
            class="mode-btn"
            :class="{ active: store.mode === 'read' }"
            @click="onSwitchMode('read')"
            title="阅读模式"
          >📖 阅读</button>
          <button
            class="mode-btn"
            :class="{ active: store.mode === 'edit' }"
            @click="onSwitchMode('edit')"
            title="编辑模式（Ctrl+E 切换）"
          >✏️ 编辑</button>
        </div>
      </div>
    </header>

    <!-- 错误提示 -->
    <div v-if="store.errorMsg" class="error-bar">
      {{ store.errorMsg }}
      <button class="btn-ghost btn-sm" @click="store.errorMsg = ''">✕</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!store.hasCurrent" class="empty">
      <div class="empty-icon">📓</div>
      <div>请从左侧选择一个笔记，或点击"新建笔记"</div>
    </div>

    <!-- 笔记内容 -->
    <div v-else class="note-body">
      <NoteEditor v-if="store.mode === 'edit'" />
      <NoteReader v-else />
    </div>
  </main>
</template>

<style scoped>
.notes-view {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.view-header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.title-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
}
.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.stat-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--bg-soft);
  color: var(--text-soft);
  border: 1px solid var(--border);
}
.stat-pill.dirty {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger);
}

.mode-switcher {
  display: flex;
  gap: 4px;
  background: var(--bg-soft);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.mode-btn {
  padding: 5px 14px;
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 13px;
  border-radius: 3px;
  transition: all 0.15s;
}
.mode-btn:hover {
  color: var(--text);
}
.mode-btn.active {
  background: var(--bg);
  color: var(--accent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.error-bar {
  margin: 12px 24px 0;
  padding: 8px 12px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.note-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
