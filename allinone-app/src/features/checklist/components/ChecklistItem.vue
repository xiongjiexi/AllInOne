<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { CheckItem } from '../lib/markdown'

const props = defineProps<{
  item: CheckItem
  pinned?: boolean
  /** 是否正在被拖拽（外部传入，用于添加视觉态） */
  dragging?: boolean
  /** 是否是当前拖放目标项（外部传入，用于显示插入指示线） */
  dragOverPosition?: 'before' | 'after' | null
}>()

const emit = defineEmits<{
  toggle: [item: CheckItem]
  edit: [item: CheckItem, text: string]
  delete: [item: CheckItem]
  togglePin: [item: CheckItem]
  dragstart: [item: CheckItem, e: DragEvent]
  dragenter: [item: CheckItem, e: DragEvent]
  dragleave: [item: CheckItem, e: DragEvent]
  dragover: [item: CheckItem, e: DragEvent]
  drop: [item: CheckItem, e: DragEvent]
}>()

const editing = ref(false)
const editText = ref('')
const editRef = ref<HTMLTextAreaElement | null>(null)

function startEdit() {
  editing.value = true
  editText.value = props.item.text
  nextTick(() => {
    editRef.value?.focus()
    const el = editRef.value
    if (el) {
      el.setSelectionRange(0, el.value.length)
      autoGrow()
    }
  })
}

function autoGrow() {
  const el = editRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function commitEdit() {
  if (!editing.value) return
  const t = editText.value.trim()
  if (t && t !== props.item.text) {
    emit('edit', props.item, t)
  }
  editing.value = false
}

function cancelEdit() {
  editing.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitEdit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
}

// ===== 拖拽 =====
// 仅在非编辑模式下允许拖拽；编辑时 textarea 需要文本选区
function onDragstart(e: DragEvent) {
  if (editing.value) {
    e.preventDefault()
    return
  }
  // 必须设置 data，否则 Firefox 不会触发 drag 事件
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(props.item.lineIndex))
  }
  emit('dragstart', props.item, e)
}

function onDragenter(e: DragEvent) {
  e.preventDefault()
  emit('dragenter', props.item, e)
}

function onDragleave(e: DragEvent) {
  emit('dragleave', props.item, e)
}

// dragover 必须在子项上 preventDefault，否则 drop 不会触发
function onDragover(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  emit('dragover', props.item, e)
}

// 子项自身的 drop
function onDrop(e: DragEvent) {
  e.preventDefault()
  emit('drop', props.item, e)
}
</script>

<template>
  <div
    class="checklist-item"
    :class="{
      checked: item.checked,
      pinned: pinned,
      dragging: dragging,
      'drag-before': dragOverPosition === 'before',
      'drag-after': dragOverPosition === 'after',
    }"
    :style="{ paddingLeft: 12 + item.indent * 18 + 'px' }"
    :draggable="!editing"
    @dragstart="onDragstart"
    @dragenter="onDragenter"
    @dragleave="onDragleave"
    @dragover="onDragover"
    @drop="onDrop"
  >
    <!-- 拖拽手柄（hover 显示，作为视觉提示） -->
    <div class="drag-handle" title="拖动调整位置">⠿</div>

    <button
      class="checkbox"
      :class="{ checked: item.checked }"
      :title="item.checked ? '标记为未完成' : '标记为已完成'"
      @click="emit('toggle', item)"
    >
      <svg v-if="item.checked" viewBox="0 0 16 16" width="12" height="12">
        <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <textarea
      v-if="editing"
      ref="editRef"
      v-model="editText"
      class="edit-input"
      rows="1"
      @keydown="onKeydown"
      @blur="commitEdit"
      @input="autoGrow"
    />
    <span
      v-else
      class="item-text"
      @dblclick="startEdit"
      :title="'双击编辑（Enter 保存，Shift+Enter 换行）'"
    >{{ item.text }}</span>

    <div class="item-actions">
      <button
        class="btn-icon btn-ghost item-action pin-action"
        :class="{ active: pinned }"
        :title="pinned ? '取消置顶' : '置顶'"
        @click="emit('togglePin', item)"
      >
        {{ pinned ? '★' : '☆' }}
      </button>
      <button class="btn-icon btn-ghost item-action" title="编辑" @click="startEdit">✎</button>
      <button class="btn-icon btn-ghost item-action" title="删除" @click="emit('delete', item)">✕</button>
    </div>
  </div>
</template>

<style scoped>
.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px 8px 0;
  border-radius: var(--radius-sm);
  transition: background 0.1s, opacity 0.1s;
  position: relative;
}
.checklist-item:hover {
  background: var(--bg-soft);
}
.checklist-item:hover .item-actions,
.checklist-item:hover .drag-handle {
  opacity: 1;
}

/* 拖拽手柄 */
.drag-handle {
  position: absolute;
  left: -2px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 12px;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s;
  user-select: none;
  width: 10px;
  line-height: 1;
}
.drag-handle:active {
  cursor: grabbing;
}

/* 置顶项：左侧蓝色条 + 浅色背景 */
.checklist-item.pinned {
  background: var(--accent-soft);
  border-left: 3px solid var(--accent);
  padding-left: 9px;
}
.checklist-item.pinned:hover {
  background: var(--accent-soft);
}
/* 置顶项手柄内移到边条右侧 */
.checklist-item.pinned .drag-handle {
  left: 12px;
}

/* 拖拽中：源项半透明 */
.checklist-item.dragging {
  opacity: 0.4;
}

/* 拖放指示线：before = 顶部一条线，after = 底部一条线 */
.checklist-item.drag-before::before,
.checklist-item.drag-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
  pointer-events: none;
}
.checklist-item.drag-before::before {
  top: -1px;
}
.checklist-item.drag-after::after {
  bottom: -1px;
}

/* 复选框 */
.checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 1.5px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition: all 0.15s;
  padding: 0;
}
.checkbox:hover {
  border-color: var(--accent);
}
.checkbox.checked {
  background: var(--success);
  border-color: var(--success);
  color: #fff;
}

.item-text {
  flex: 1;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  cursor: text;
}

.checklist-item.checked .item-text {
  color: var(--text-muted);
  opacity: 0.75;
}

.edit-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  outline: none;
  resize: none;
  overflow: hidden;
  min-height: 28px;
}

.item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  margin-top: 2px;
}
.item-action {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 6px;
}
.item-action:hover {
  color: var(--danger);
}
.pin-action.active {
  color: var(--accent);
  opacity: 1;
}
.checklist-item.pinned .item-actions {
  opacity: 1;
}
.checklist-item.pinned .pin-action {
  opacity: 1;
}
</style>
