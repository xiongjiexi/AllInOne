<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useChecklistStore } from '../stores/checklist'
import ChecklistItem from './ChecklistItem.vue'

const store = useChecklistStore()
const newItemText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

// 使用重排后的展示列表（置顶在前，已完成项保持原位）
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

// ===== 迁移未完成项 =====
// 下拉菜单：迁移到今日 / 迁移到自定义
const carryoverMenuOpen = ref(false)
const carryoverMenuRef = ref<HTMLDivElement | null>(null)

function toggleCarryoverMenu() {
  carryoverMenuOpen.value = !carryoverMenuOpen.value
}
function closeCarryoverMenu() {
  carryoverMenuOpen.value = false
}

async function onCarryoverToToday() {
  closeCarryoverMenu()
  if (!confirm('将当前清单中未完成的事项迁移到【今日清单】？\n（若今日清单已存在则追加；旧清单保留）')) return
  await store.carryoverToToday()
}

async function onCarryoverToNamed() {
  closeCarryoverMenu()
  const name = window.prompt('请输入目标清单名称（已存在则追加未完成项）：')
  if (name === null) return
  await store.carryoverToNamed(name)
}

// 点击外部关闭下拉
function onDocClick(e: MouseEvent) {
  if (!carryoverMenuRef.value) return
  if (!carryoverMenuRef.value.contains(e.target as Node)) {
    closeCarryoverMenu()
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
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
        <div class="carryover-dropdown" ref="carryoverMenuRef">
          <button
            class="btn btn-sm"
            :class="{ active: carryoverMenuOpen }"
            @click.stop="toggleCarryoverMenu"
            title="把当前清单未完成项迁移到另一份清单"
          >
            ⮕ 迁移未完成 ▾
          </button>
          <div v-if="carryoverMenuOpen" class="carryover-menu">
            <div class="menu-item" @click="onCarryoverToToday">
              📅 迁移到今日清单
              <span class="menu-hint">已存在则追加</span>
            </div>
            <div class="menu-item" @click="onCarryoverToNamed">
              📝 迁移到自定义清单…
              <span class="menu-hint">输入名称</span>
            </div>
          </div>
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
      <div class="items-area">
        <div v-if="items.length === 0" class="empty-items">
          当前清单暂无待办项，添加第一条吧
        </div>
        <ChecklistItem
          v-for="(item, idx) in items"
          :key="item.lineIndex"
          :item="item"
          :pinned="store.isItemPinned(item)"
          :is-first="idx === 0"
          :is-last="idx === items.length - 1"
          @toggle="store.toggleItem"
          @toggle-pin="store.toggleItemPin"
          @edit="store.editItemText"
          @delete="store.deleteItem"
          @move-up="store.moveItemUp"
          @move-down="store.moveItemDown"
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

/* 迁移下拉菜单 */
.carryover-dropdown {
  position: relative;
}
.carryover-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 220px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 100;
  padding: 4px;
  animation: fadeIn 0.12s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.menu-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.1s;
}
.menu-item:hover {
  background: var(--bg-soft);
}
.menu-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}
.btn.active {
  background: var(--accent-soft);
  color: var(--accent);
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
