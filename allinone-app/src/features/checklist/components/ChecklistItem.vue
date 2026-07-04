<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { CheckItem } from '../lib/markdown'

const props = defineProps<{
  item: CheckItem
  pinned?: boolean
  /** 是否为第一项（用于禁用上移按钮） */
  isFirst?: boolean
  /** 是否为最后一项（用于禁用下移按钮） */
  isLast?: boolean
}>()

const emit = defineEmits<{
  toggle: [item: CheckItem]
  edit: [item: CheckItem, text: string]
  delete: [item: CheckItem]
  togglePin: [item: CheckItem]
  moveUp: [item: CheckItem]
  moveDown: [item: CheckItem]
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
</script>

<template>
  <div
    class="checklist-item"
    :class="{
      checked: item.checked,
      pinned: pinned,
    }"
    :style="{ paddingLeft: 12 + item.indent * 18 + 'px' }"
  >
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
        class="btn-icon btn-ghost item-action move-action"
        :disabled="isFirst"
        :title="isFirst ? '已是第一项' : '上移'"
        @click="emit('moveUp', item)"
      >▲</button>
      <button
        class="btn-icon btn-ghost item-action move-action"
        :disabled="isLast"
        :title="isLast ? '已是最后一项' : '下移'"
        @click="emit('moveDown', item)"
      >▼</button>
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
.checklist-item:hover .item-actions {
  opacity: 1;
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
  color: var(--accent);
}
.item-action:disabled {
  color: var(--border);
  cursor: not-allowed;
}
.item-action:disabled:hover {
  color: var(--border);
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

/* 上移/下移按钮稍小 */
.move-action {
  font-size: 10px;
  padding: 4px 5px;
}
</style>
