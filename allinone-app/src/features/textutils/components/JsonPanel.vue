<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatJson, minifyJson, escapeJsonString, unescapeJsonString } from '../lib/json'

const input = ref('')
const indent = ref(2)
const errorMsg = ref('')
const output = ref('')

function run(fn: (i: string) => { ok: boolean; output: string; error?: string }) {
  const r = fn(input.value)
  if (r.ok) {
    output.value = r.output
    errorMsg.value = ''
  } else {
    output.value = ''
    errorMsg.value = r.error || '解析失败'
  }
}

function onFormat() {
  run((i) => formatJson(i, indent.value))
}
function onMinify() {
  run(minifyJson)
}
function onEscape() {
  // 字符串转义不需要 try
  output.value = escapeJsonString(input.value)
  errorMsg.value = ''
}
function onUnescape() {
  run(unescapeJsonString)
}
function onCopyOutput() {
  if (output.value) navigator.clipboard.writeText(output.value)
}
function onClear() {
  input.value = ''
  output.value = ''
  errorMsg.value = ''
}

const stats = computed(() => {
  const len = output.value.length
  return len > 0 ? `${len} 字符` : ''
})
</script>

<template>
  <div class="json-tool">
    <div class="actions">
      <button class="btn btn-primary btn-sm" @click="onFormat">美化</button>
      <button class="btn btn-sm" @click="onMinify">压缩</button>
      <button class="btn btn-sm" @click="onEscape">转义字符串</button>
      <button class="btn btn-sm" @click="onUnescape">反转义字符串</button>
      <label class="indent-label">
        缩进
        <input type="number" min="0" max="8" v-model.number="indent" class="indent-input" />
      </label>
      <div class="spacer"></div>
      <button class="btn btn-sm" @click="onCopyOutput" :disabled="!output">📋 复制</button>
      <button class="btn btn-ghost btn-sm" @click="onClear">清空</button>
    </div>

    <div class="panes">
      <textarea
        v-model="input"
        class="pane"
        placeholder='粘贴 JSON，例如 {"a":1,"b":[2,3]}'
        spellcheck="false"
      />
      <div class="pane output-pane">
        <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
        <pre v-else>{{ output }}</pre>
      </div>
    </div>
    <div class="stats" v-if="stats">{{ stats }}</div>
  </div>
</template>

<style scoped>
.json-tool {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.spacer { flex: 1; }
.indent-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-soft);
}
.indent-input {
  width: 48px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
}
.panes {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  min-height: 0;
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
  white-space: pre-wrap;
  word-break: break-word;
}
.pane:focus {
  border-color: var(--accent);
}
.output-pane {
  overflow: auto;
  margin: 0;
}
.output-pane pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.error {
  color: var(--danger);
  padding: 8px;
  font-family: monospace;
  font-size: 12px;
}
.stats {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
</style>
