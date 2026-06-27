<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { ptyWrite } from '../lib/backend'

const props = defineProps<{
  sessionId: number | null
}>()

const input = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// 简单的白名单：仅允许 git / git-xxx 开头，防止误操作
function isAllowed(cmd: string): boolean {
  const trimmed = cmd.trim()
  return /^git[-\s]/.test(trimmed) || trimmed === 'git'
}

async function execute() {
  if (!props.sessionId) {
    alert('请先选择一个仓库')
    return
  }
  const cmd = input.value.trim()
  if (!cmd) return
  if (!isAllowed(cmd)) {
    alert(`仅允许执行 git 命令（当前输入: ${cmd}）`)
    return
  }
  await ptyWrite(props.sessionId, cmd + '\n')
  input.value = ''
  await nextTick()
  inputRef.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    execute()
  }
}
</script>

<template>
  <div class="cmd-input-bar">
    <span class="prompt">$</span>
    <input
      ref="inputRef"
      v-model="input"
      class="cmd-input"
      placeholder="输入 git 命令，回车执行…（仅允许 git 开头）"
      :disabled="!props.sessionId"
      @keydown="onKeydown"
    />
    <button
      class="btn btn-sm btn-primary"
      :disabled="!props.sessionId || !input.trim()"
      @click="execute"
    >
      执行
    </button>
  </div>
</template>

<style scoped>
.cmd-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-sidebar);
}
.prompt {
  color: var(--success);
  font-family: Menlo, Consolas, monospace;
  font-size: 14px;
  flex-shrink: 0;
}
.cmd-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  font-family: Menlo, Consolas, monospace;
  outline: none;
}
.cmd-input:focus {
  border-color: var(--accent);
}
.cmd-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
