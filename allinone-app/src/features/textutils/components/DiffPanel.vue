<script setup lang="ts">
import { ref, computed } from 'vue'
import { computeLineDiff, diffStats } from '../lib/diff'

const leftText = ref('')
const rightText = ref('')
const ignoreWhitespace = ref(false)

const diffLines = computed(() => {
  let l = leftText.value
  let r = rightText.value
  if (ignoreWhitespace.value) {
    // 简单策略：去掉行首行尾空白后对比（保持行数对齐）
    l = l.split('\n').map((s) => s.trim()).join('\n')
    r = r.split('\n').map((s) => s.trim()).join('\n')
  }
  return computeLineDiff(l, r)
})

const stats = computed(() => diffStats(diffLines.value))

// 仅展示包含差异的区域（上下各保留 2 行上下文）
const visibleLines = computed(() => {
  const lines = diffLines.value
  if (lines.length === 0) return []

  // 找出所有 add/del 行的索引
  const diffIdx: number[] = []
  lines.forEach((l, i) => {
    if (l.type !== 'equal') diffIdx.push(i)
  })

  if (diffIdx.length === 0) {
    // 完全相同：只展示首尾各 3 行
    if (lines.length <= 6) return lines.map((l, i) => ({ ...l, idx: i }))
    return [
      ...lines.slice(0, 3).map((l, i) => ({ ...l, idx: i })),
      { type: 'skip', text: `… ${lines.length - 6} 行相同 …`, leftNo: null, rightNo: null, idx: -1 },
      ...lines.slice(-3).map((l, i) => ({ ...l, idx: lines.length - 3 + i })),
    ]
  }

  // 收集需要展示的索引（diff 行 ± 2 上下文）
  const show = new Set<number>()
  const ctx = 2
  for (const idx of diffIdx) {
    for (let i = Math.max(0, idx - ctx); i <= Math.min(lines.length - 1, idx + ctx); i++) {
      show.add(i)
    }
  }

  const sorted = [...show].sort((a, b) => a - b)
  const result: (DiffLineWithIdx | SkipLine)[] = []
  let prev = -1
  for (const idx of sorted) {
    if (prev >= 0 && idx > prev + 1) {
      result.push({
        type: 'skip',
        text: `… ${idx - prev - 1} 行相同 …`,
        leftNo: null,
        rightNo: null,
        idx: -1,
      })
    }
    result.push({ ...lines[idx], idx })
    prev = idx
  }
  return result
})

type DiffLineWithIdx = { type: 'equal' | 'add' | 'del'; text: string; leftNo: number | null; rightNo: number | null; idx: number }
type SkipLine = { type: 'skip'; text: string; leftNo: null; rightNo: null; idx: number }

function onSwap() {
  const t = leftText.value
  leftText.value = rightText.value
  rightText.value = t
}
function onClear() {
  leftText.value = ''
  rightText.value = ''
}
</script>

<template>
  <div class="diff-tool">
    <div class="actions">
      <button class="btn btn-sm" @click="onSwap" title="交换左右">⇄ 交换</button>
      <label class="checkbox-label">
        <input type="checkbox" v-model="ignoreWhitespace" />
        忽略行首尾空白
      </label>
      <div class="spacer"></div>
      <span class="stat added">+{{ stats.added }}</span>
      <span class="stat deleted">-{{ stats.deleted }}</span>
      <button class="btn btn-ghost btn-sm" @click="onClear">清空</button>
    </div>

    <div class="input-panes">
      <textarea
        v-model="leftText"
        class="pane"
        placeholder="原始文本（左侧）"
        spellcheck="false"
      />
      <textarea
        v-model="rightText"
        class="pane"
        placeholder="对比文本（右侧）"
        spellcheck="false"
      />
    </div>

    <div class="diff-result">
      <div class="diff-header">
        <span>对比结果</span>
        <span class="hint" v-if="stats.added + stats.deleted === 0 && leftText">无差异</span>
      </div>
      <div class="diff-body">
        <div
          v-for="line in visibleLines"
          :key="line.idx"
          :class="['line', `line-${line.type}`]"
        >
          <span class="line-no left">{{ line.leftNo ?? '' }}</span>
          <span class="line-no right">{{ line.rightNo ?? '' }}</span>
          <span class="line-marker">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : line.type === 'skip' ? '·' : ' ' }}</span>
          <span class="line-text">{{ line.text }}</span>
        </div>
        <div v-if="!leftText && !rightText" class="empty-hint">
          在上方输入两段文本即可对比
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-tool {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
  min-height: 0;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.spacer { flex: 1; }
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-soft);
}
.stat {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.stat.added {
  color: var(--success);
  background: rgba(22, 163, 74, 0.1);
}
.stat.deleted {
  color: var(--danger);
  background: rgba(220, 38, 38, 0.1);
}

.input-panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  height: 35%;
  min-height: 0;
  flex-shrink: 0;
}
.pane {
  width: 100%;
  height: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
  outline: none;
}
.pane:focus {
  border-color: var(--accent);
}

.diff-result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.diff-header {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-soft);
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hint { color: var(--success); }

.diff-body {
  flex: 1;
  overflow: auto;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
}
.line {
  display: flex;
  align-items: baseline;
  white-space: pre;
}
.line-no {
  display: inline-block;
  width: 44px;
  padding: 0 6px;
  text-align: right;
  color: var(--text-muted);
  user-select: none;
  flex-shrink: 0;
}
.line-marker {
  width: 16px;
  text-align: center;
  user-select: none;
  flex-shrink: 0;
}
.line-text {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
  padding-right: 10px;
}
.line-equal {
  background: transparent;
}
.line-add {
  background: rgba(22, 163, 74, 0.12);
}
.line-add .line-marker {
  color: var(--success);
}
.line-del {
  background: rgba(220, 38, 38, 0.12);
}
.line-del .line-marker {
  color: var(--danger);
}
.line-skip {
  background: var(--bg-soft);
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: 2px 0;
}
.line-skip .line-text {
  text-align: center;
}
.empty-hint {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
