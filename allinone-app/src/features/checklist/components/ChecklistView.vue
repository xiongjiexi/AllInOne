<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useChecklistStore } from '../stores/checklist'
import ChecklistItem from './ChecklistItem.vue'
import type { CheckItem } from '../lib/markdown'

const store = useChecklistStore()
const newItemText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

// 使用重排后的展示列表（置顶在前、已完成沉底）
const items = computed(() => store.displayItems)
const title = computed(() => {
  if (!store.hasCurrent) return '清单'
  return store.currentFileName.replace(/\.md$/i, '')
})

async function onAdd() {
  const text = newItemText.value.trim()
  if (!text) return
  await store.addItem(text)
  newItemText.value = ''
  await nextTick()
  inputRef.value?.focus()
  autoGrow()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onAdd()
  }
}

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

async function onCarryover() {
  if (!confirm('将当前清单中未完成的事项迁移到新清单？\n（旧清单会保留）')) return
  await store.createNextListWithCarryover()
}

// ===== 拖拽排序 =====
// 拖拽状态由父组件统一管理：
// - dragSourceLine: 正在被拖拽的源项 lineIndex
// - dragOverLine / dragOverPos: 当前拖放目标项 lineIndex 与插入位置（before/after）
// 用 lineIndex 作为项标识，避免对象引用变化导致状态失效
const dragSourceLine = ref<number | null>(null)
const dragOverLine = ref<number | null>(null)
const dragOverPos = ref<'before' | 'after' | null>(null)
// dragenter 计数：dragenter/dragleave 在子元素间冒泡会反复触发，
// 用计数器只在真正离开整个项时才清空指示
const enterCounts = new Map<number, number>()

function onItemDragstart(item: CheckItem, e: DragEvent) {
  dragSourceLine.value = item.lineIndex
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onItemDragenter(item: CheckItem, e: DragEvent) {
  if (dragSourceLine.value === null) return
  if (item.lineIndex === dragSourceLine.value) {
    dragOverLine.value = null
    dragOverPos.value = null
    return
  }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

  // 计算插入位置：鼠标在项上半部 → before，下半部 → after
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const offset = e.clientY - rect.top
  dragOverLine.value = item.lineIndex
  dragOverPos.value = offset < rect.height / 2 ? 'before' : 'after'

  // 计数
  enterCounts.set(item.lineIndex, (enterCounts.get(item.lineIndex) ?? 0) + 1)
}

function onItemDragleave(item: CheckItem) {
  const c = (enterCounts.get(item.lineIndex) ?? 0) - 1
  if (c <= 0) {
    enterCounts.delete(item.lineIndex)
    if (dragOverLine.value === item.lineIndex) {
      dragOverLine.value = null
      dragOverPos.value = null
    }
  } else {
    enterCounts.set(item.lineIndex, c)
  }
}

// 整个 items-area 的 dragover：必须 preventDefault 才能 drop
function onAreaDragover(e: DragEvent) {
  if (dragSourceLine.value === null) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

// 子项 dragover：也更新指示线位置（更流畅）
function onItemDragover(item: CheckItem, e: DragEvent) {
  if (dragSourceLine.value === null) return
  if (item.lineIndex === dragSourceLine.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const offset = e.clientY - rect.top
  dragOverLine.value = item.lineIndex
  dragOverPos.value = offset < rect.height / 2 ? 'before' : 'after'
}

// 执行拖拽搬移的核心逻辑
async function doMove() {
  const fromLine = dragSourceLine.value
  const toLine = dragOverLine.value
  const pos = dragOverPos.value
  if (fromLine === null || toLine === null || !pos) return

  const fromItem = store.items.find(i => i.lineIndex === fromLine)
  const toItem = store.items.find(i => i.lineIndex === toLine)
  if (!fromItem || !toItem) return
  await store.moveItem(fromItem, toItem, pos)
}

// 子项 drop：直接执行搬移（不依赖冒泡到 area）
async function onItemDrop(item: CheckItem, e: DragEvent) {
  e.preventDefault()
  // 确保目标项已记录
  if (dragOverLine.value !== item.lineIndex) {
    dragOverLine.value = item.lineIndex
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offset = e.clientY - rect.top
    dragOverPos.value = offset < rect.height / 2 ? 'before' : 'after'
  }
  await doMove()
  // 清理状态
  dragSourceLine.value = null
  dragOverLine.value = null
  dragOverPos.value = null
  enterCounts.clear()
}

// 整个 items-area 的 drop（兜底：若 drop 落在子项间隙）
async function onAreaDrop(e: DragEvent) {
  e.preventDefault()
  await doMove()
  dragSourceLine.value = null
  dragOverLine.value = null
  dragOverPos.value = null
  enterCounts.clear()
}

// 拖拽结束（无论是否 drop）清理状态
function onDragend() {
  dragSourceLine.value = null
  dragOverLine.value = null
  dragOverPos.value = null
  enterCounts.clear()
}

// 判断某项是否正在被拖拽
function isDragging(item: CheckItem): boolean {
  return dragSourceLine.value === item.lineIndex
}
function dragPosOf(item: CheckItem): 'before' | 'after' | null {
  if (dragOverLine.value === item.lineIndex) return dragOverPos.value
  return null
}
</script>

<template>
  <main class="checklist-view">
    <!-- 顶部标题区 -->
    <header class="view-header">
      <div class="title-area">
        <h1 class="title">{{ title }}</h1>
        <div class="stats" v-if="store.hasCurrent">
          <span class="stat-pill">
            {{ store.uncheckedCount }} 待办
          </span>
          <span class="stat-pill done">
            {{ store.checkedCount }} 已完成
          </span>
        </div>
      </div>
      <div class="header-actions" v-if="store.hasCurrent">
        <button class="btn btn-sm" @click="onCarryover" title="基于当前清单新建下一份，自动迁移未完成项">
          ⮕ 迁移未完成到新清单
        </button>
      </div>
    </header>

    <!-- 错误提示 -->
    <div v-if="store.errorMsg" class="error-bar">
      {{ store.errorMsg }}
      <button class="btn-ghost btn-sm" @click="store.errorMsg = ''">✕</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!store.hasCurrent" class="empty">
      <div class="empty-icon">📝</div>
      <div>请从左侧选择一个清单，或点击"新建今日清单"</div>
    </div>

    <!-- 清单内容 -->
    <div v-else class="checklist-body">
      <!-- 新增输入框（支持多行，Shift+Enter 换行，Enter 添加） -->
      <div class="add-row">
        <textarea
          ref="inputRef"
          v-model="newItemText"
          class="add-input"
          placeholder="添加新待办，回车确认；Shift+回车换行…"
          rows="1"
          @keydown="onKeydown"
          @input="autoGrow"
        />
        <button class="btn btn-primary add-btn" :disabled="!newItemText.trim()" @click="onAdd">添加</button>
      </div>

      <!-- 清单列表 -->
      <div
        class="items-area"
        @dragover="onAreaDragover"
        @drop="onAreaDrop"
      >
        <div v-if="items.length === 0" class="empty-items">
          当前清单暂无待办项，添加第一条吧
        </div>
        <ChecklistItem
          v-for="item in items"
          :key="item.lineIndex"
          :item="item"
          :pinned="store.isItemPinned(item)"
          :dragging="isDragging(item)"
          :drag-over-position="dragPosOf(item)"
          @toggle="store.toggleItem"
          @toggle-pin="store.toggleItemPin"
          @edit="store.editItemText"
          @delete="store.deleteItem"
          @dragstart="onItemDragstart"
          @dragenter="onItemDragenter"
          @dragleave="onItemDragleave"
          @dragover="onItemDragover"
          @drop="onItemDrop"
          @dragend="onDragend"
        />
      </div>

      <!-- 原始 MD 预览（折叠） -->
      <details class="raw-preview">
        <summary>查看原始 Markdown</summary>
        <pre>{{ store.currentContent }}</pre>
      </details>
    </div>
  </main>
</template>

<style scoped>
.checklist-view {
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
}
.stat-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--bg-soft);
  color: var(--text-soft);
  border: 1px solid var(--border);
}
.stat-pill.done {
  color: var(--success);
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

.checklist-body {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.add-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s;
  resize: none;
  overflow: hidden;
  min-height: 36px;
}
.add-input:focus {
  border-color: var(--accent);
}
.add-btn {
  align-self: stretch;
}

.items-area {
  display: flex;
  flex-direction: column;
}
.empty-items {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.raw-preview {
  margin-top: 18px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.raw-preview summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  user-select: none;
}
.raw-preview pre {
  margin-top: 8px;
  padding: 12px;
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-soft);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
}
</style>
