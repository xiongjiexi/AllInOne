<script setup lang="ts">
import { ref, computed } from 'vue'
import { encodeUnicode, decodeUnicode, encodeBase64, decodeBase64 } from '../lib/unicode'

const input = ref('')
const output = ref('')
const errorMsg = ref('')
const useES6 = ref(false)

function run(fn: (i: string, es6: boolean) => string) {
  try {
    output.value = fn(input.value, useES6.value)
    errorMsg.value = ''
  } catch (e) {
    output.value = ''
    errorMsg.value = (e as Error).message
  }
}

function runOpt(fn: (i: string) => { ok: boolean; output: string; error?: string }) {
  const r = fn(input.value)
  if (r.ok) {
    output.value = r.output
    errorMsg.value = ''
  } else {
    output.value = ''
    errorMsg.value = r.error || '失败'
  }
}

function onEncodeUnicode() {
  run((i, es6) => encodeUnicode(i, es6))
}
function onDecodeUnicode() {
  runOpt(decodeUnicode)
}
function onEncodeBase64() {
  output.value = encodeBase64(input.value)
  errorMsg.value = ''
}
function onDecodeBase64() {
  runOpt(decodeBase64)
}
function onSwap() {
  input.value = output.value
  output.value = ''
  errorMsg.value = ''
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
  <div class="unicode-tool">
    <div class="actions">
      <button class="btn btn-primary btn-sm" @click="onEncodeUnicode">编码 \u</button>
      <button class="btn btn-sm" @click="onDecodeUnicode">解码 \u</button>
      <span class="divider">|</span>
      <button class="btn btn-sm" @click="onEncodeBase64">Base64 编码</button>
      <button class="btn btn-sm" @click="onDecodeBase64">Base64 解码</button>
      <label class="checkbox-label">
        <input type="checkbox" v-model="useES6" />
        ES6 \u{}
      </label>
      <div class="spacer"></div>
      <button class="btn btn-sm" @click="onSwap" title="把输出移到输入">⇅ 互换</button>
      <button class="btn btn-sm" @click="onCopyOutput" :disabled="!output">📋 复制</button>
      <button class="btn btn-ghost btn-sm" @click="onClear">清空</button>
    </div>

    <div class="panes">
      <textarea
        v-model="input"
        class="pane"
        placeholder="输入文本或 \\uXXXX / Base64 字符串…"
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
.unicode-tool {
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
  flex-wrap: wrap;
}
.spacer { flex: 1; }
.divider { color: var(--text-muted); }
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-soft);
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
