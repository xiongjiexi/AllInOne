<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
  modelValue: string
  /** 全量分支列表（已去重） */
  branches: string[]
  /** 加载中状态 */
  loading?: boolean
  /** 加载错误 */
  error?: string
  placeholder?: string
  disabled?: boolean
  /** 最近使用分支（置顶显示） */
  recent?: string[]
  /** 推荐分支（如当前分支、上游，置顶显示，仅次于 recent） */
  suggested?: string[]
  /** 是否正在加载推荐分支（轻量状态，先于 branches 完成） */
  suggestLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'retry'): void
}>()

const open = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)
const scrollRef = ref<HTMLDivElement | null>(null)
const highlightIndex = ref(-1)

// 输入框文本：未展开时显示 modelValue，展开时允许编辑用于搜索
const query = ref('')

// 虚拟滚动参数
const ITEM_HEIGHT = 28
const VISIBLE_MAX = 240
const viewportHeight = computed(() => {
  const total = flatList.value.length
  const maxByData = total * ITEM_HEIGHT
  return Math.min(maxByData, VISIBLE_MAX)
})

const scrollTop = ref(0)

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLDivElement).scrollTop
}

const startIndex = computed(() => Math.floor(scrollTop.value / ITEM_HEIGHT))
const endIndex = computed(() => {
  const count = Math.ceil(VISIBLE_MAX / ITEM_HEIGHT) + 2
  return Math.min(startIndex.value + count, flatList.value.length)
})

// 分组结构：recent 组、suggested 组、全部分支组
interface BranchItem {
  type: 'recent' | 'suggested' | 'all'
  label: string
}

// 扁平化列表：用于虚拟滚动的索引访问
// 结构：[组标题, 项, 项, ..., 组标题, 项, ...]
// 组标题占位高度也按 ITEM_HEIGHT 计算，渲染样式不同
const flatList = computed<{ kind: 'header' | 'item'; text: string; groupType?: BranchItem['type'] }[]>(() => {
  const result: { kind: 'header' | 'item'; text: string; groupType?: BranchItem['type'] }[] = []
  const q = query.value.trim().toLowerCase()
  const seen = new Set<string>()

  // 1. 最近使用
  const recent = (props.recent ?? []).filter(b => b)
  if (recent.length > 0) {
    const filtered = recent.filter(b => !q || b.toLowerCase().includes(q))
    if (filtered.length > 0) {
      result.push({ kind: 'header', text: '最近使用', groupType: 'recent' })
      filtered.forEach(b => {
        result.push({ kind: 'item', text: b, groupType: 'recent' })
        seen.add(b)
      })
    }
  }

  // 2. 推荐（当前分支、上游、最近本地）
  const suggested = (props.suggested ?? []).filter(b => b && !seen.has(b))
  if (suggested.length > 0) {
    const filtered = suggested.filter(b => !q || b.toLowerCase().includes(q))
    if (filtered.length > 0) {
      result.push({ kind: 'header', text: '推荐', groupType: 'suggested' })
      filtered.forEach(b => {
        result.push({ kind: 'item', text: b, groupType: 'suggested' })
        seen.add(b)
      })
    }
  }

  // 3. 全部分支
  const all = props.branches.filter(b => !seen.has(b))
  if (all.length > 0) {
    const filtered = all.filter(b => !q || b.toLowerCase().includes(q))
    if (filtered.length > 0) {
      result.push({ kind: 'header', text: '全部分支', groupType: 'all' })
      filtered.forEach(b => {
        result.push({ kind: 'item', text: b, groupType: 'all' })
      })
    }
  }

  return result
})

// 仅 item 的索引列表（用于键盘导航）
const itemIndexes = computed(() => {
  const idxs: number[] = []
  flatList.value.forEach((item, i) => {
    if (item.kind === 'item') idxs.push(i)
  })
  return idxs
})

watch(open, (v) => {
  if (v) {
    query.value = ''
    scrollTop.value = 0
    // 高亮当前选中项
    const currentIdx = flatList.value.findIndex(
      item => item.kind === 'item' && item.text === props.modelValue
    )
    highlightIndex.value = currentIdx
    nextTick(() => {
      inputRef.value?.focus()
      // 滚动到高亮项
      if (currentIdx > 0 && scrollRef.value) {
        scrollRef.value.scrollTop = Math.floor(currentIdx / ITEM_HEIGHT) * ITEM_HEIGHT
      }
    })
  }
})

// 点击外部关闭
function onDocClick(e: MouseEvent) {
  const target = e.target as Node
  if (listRef.value && listRef.value.contains(target)) return
  open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function toggleOpen() {
  if (props.disabled) return
  open.value = !open.value
}

function selectBranch(b: string) {
  emit('update:modelValue', b)
  open.value = false
}

function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
  scrollTop.value = 0
  // 高亮第一项
  highlightIndex.value = itemIndexes.value.length > 0 ? itemIndexes.value[0] : -1
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  const items = itemIndexes.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const curPos = items.indexOf(highlightIndex.value)
    if (curPos < items.length - 1) {
      highlightIndex.value = items[curPos + 1]
      scrollIntoView()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const curPos = items.indexOf(highlightIndex.value)
    if (curPos > 0) {
      highlightIndex.value = items[curPos - 1]
      scrollIntoView()
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (highlightIndex.value >= 0 && highlightIndex.value < flatList.value.length) {
      const item = flatList.value[highlightIndex.value]
      if (item.kind === 'item') {
        selectBranch(item.text)
        return
      }
    }
    if (query.value.trim()) {
      // 允许直接用输入的值（自由输入分支名）
      selectBranch(query.value.trim())
    }
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

function scrollIntoView() {
  if (!scrollRef.value) return
  const idx = highlightIndex.value
  if (idx < 0) return
  const top = idx * ITEM_HEIGHT
  const bottom = top + ITEM_HEIGHT
  const viewTop = scrollTop.value
  const viewBottom = scrollTop.value + VISIBLE_MAX
  if (top < viewTop) {
    scrollRef.value.scrollTop = top
  } else if (bottom > viewBottom) {
    scrollRef.value.scrollTop = bottom - VISIBLE_MAX
  }
}
</script>

<template>
  <div class="branch-selector" ref="listRef">
    <div
      class="selector-input"
      :class="{ disabled, active: open }"
      @click="toggleOpen"
    >
      <span v-if="!open" class="selected-value" :class="{ placeholder: !modelValue }">
        {{ modelValue || placeholder || '请选择分支' }}
      </span>
      <input
        v-else
        ref="inputRef"
        class="search-input"
        type="text"
        :value="query"
        :placeholder="modelValue || '搜索分支...'"
        @input="onInput"
        @keydown="onKeydown"
      />
      <span class="arrow" :class="{ up: open }">▼</span>
    </div>

    <div v-if="open" class="dropdown">
      <!-- 加载中（首次加载，无任何数据） -->
      <div v-if="loading && branches.length === 0 && (suggestLoading || !suggested || suggested.length === 0)" class="dropdown-loading">
        <div class="skeleton-row" v-for="i in 5" :key="i"></div>
        <div class="loading-text">正在加载分支...</div>
      </div>
      <!-- 加载错误 -->
      <div v-else-if="error && branches.length === 0" class="dropdown-error">
        <div>分支加载失败</div>
        <div class="error-detail">{{ error }}</div>
        <button class="retry-btn" @click.stop="emit('retry')">重试</button>
      </div>
      <!-- 无匹配 -->
      <div v-else-if="flatList.length === 0" class="dropdown-empty">
        无匹配分支<span v-if="query.trim()">，按回车使用 "{{ query.trim() }}"</span>
      </div>
      <!-- 虚拟滚动列表 -->
      <div
        v-else
        ref="scrollRef"
        class="dropdown-scroll"
        :style="{ height: viewportHeight + 'px' }"
        @scroll.passive="onScroll"
      >
        <!-- 顶部占位 -->
        <div :style="{ height: startIndex * ITEM_HEIGHT + 'px' }"></div>
        <!-- 可见项 -->
        <div
          v-for="i in (endIndex - startIndex)"
          :key="startIndex + i - 1"
        >
          <template v-if="flatList[startIndex + i - 1]">
            <div
              v-if="flatList[startIndex + i - 1].kind === 'header'"
              class="dropdown-header"
            >
              {{ flatList[startIndex + i - 1].text }}
            </div>
            <div
              v-else
              class="dropdown-item"
              :class="{
                highlighted: (startIndex + i - 1) === highlightIndex,
                selected: flatList[startIndex + i - 1].text === modelValue,
                'group-recent': flatList[startIndex + i - 1].groupType === 'recent',
                'group-suggested': flatList[startIndex + i - 1].groupType === 'suggested',
              }"
              @click="selectBranch(flatList[startIndex + i - 1].text)"
              @mouseenter="highlightIndex = startIndex + i - 1"
            >
              <span class="item-tag" v-if="flatList[startIndex + i - 1].groupType === 'recent'">最近</span>
              <span class="item-tag" v-else-if="flatList[startIndex + i - 1].groupType === 'suggested'">推荐</span>
              <span class="item-text">{{ flatList[startIndex + i - 1].text }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.branch-selector {
  position: relative;
  flex: 1;
  min-width: 0;
}

.selector-input {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  min-height: 28px;
}
.selector-input:hover {
  border-color: var(--accent);
}
.selector-input.active {
  border-color: var(--accent);
}
.selector-input.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.selected-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-value.placeholder {
  color: var(--text-muted);
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  min-width: 0;
}

.arrow {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.arrow.up {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 280px;
  display: flex;
  flex-direction: column;
}

.dropdown-scroll {
  overflow-y: auto;
  position: relative;
}

.dropdown-header {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-soft);
  font-weight: 500;
  height: 28px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
}

.dropdown-item {
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dropdown-item:hover,
.dropdown-item.highlighted {
  background: var(--bg-soft);
}
.dropdown-item.selected {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.item-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}
.dropdown-item.group-recent .item-tag {
  background: #fff3cd;
  color: #856404;
}
.dropdown-item.group-suggested .item-tag {
  background: #d4edda;
  color: #155724;
}

.item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-empty,
.dropdown-error {
  padding: 10px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
.dropdown-error {
  color: #e74c3c;
}
.error-detail {
  font-size: 11px;
  color: var(--text-muted);
  margin: 6px 0;
  word-break: break-all;
}
.retry-btn {
  padding: 4px 12px;
  border: 1px solid var(--accent);
  background: var(--bg);
  color: var(--accent);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
}
.retry-btn:hover {
  background: var(--accent-soft);
}

.dropdown-loading {
  padding: 10px;
}
.skeleton-row {
  height: 20px;
  margin: 6px 0;
  background: linear-gradient(90deg, var(--bg-soft) 25%, var(--bg) 50%, var(--bg-soft) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.4s ease infinite;
  border-radius: var(--radius-sm);
}
@keyframes skeleton {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.loading-text {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
}
</style>
