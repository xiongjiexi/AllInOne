<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useThemeStore } from '../../../stores/theme'
import { useGitFastStore } from '../stores/gitfast'
import { ptyWrite, ptyResize } from '../lib/backend'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  repoId: string
}>()

const theme = useThemeStore()
const store = useGitFastStore()

const containerRef = ref<HTMLDivElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let unlistenOutput: UnlistenFn | null = null
let unlistenExit: UnlistenFn | null = null
let resizeObserver: ResizeObserver | null = null
let activeSessionId: number | null = null

function getThemeColors() {
  const dark = theme.mode === 'dark'
  return {
    background: dark ? '#1a1b1e' : '#ffffff',
    foreground: dark ? '#e6e6e8' : '#1f2328',
    cursor: dark ? '#e6e6e8' : '#1f2328',
    selectionBackground: dark ? '#3a3d44' : '#bcc8e4',
  }
}

async function initTerminal() {
  if (!containerRef.value) return
  const repo = store.repositories.find(r => r.id === props.repoId)
  if (!repo) return

  term = new Terminal({
    fontSize: 13,
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    cursorBlink: true,
    convertEol: false,
    theme: getThemeColors(),
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(containerRef.value)
  fitAddon.fit()

  // 启动 PTY 会话
  const sessionId = await store.ensureSession(repo.id, repo.path)
  activeSessionId = sessionId

  // 写头部信息
  term.writeln(`\x1b[36m# ${repo.name} (${repo.path})\x1b[0m`)
  term.writeln(`\x1b[90m# session ${sessionId}\x1b[0m`)

  // 监听 PTY 输出
  unlistenOutput = await listen<{ sessionId: number; data: string }>(
    'gitfast_pty_output',
    (e) => {
      if (e.payload.sessionId === activeSessionId && term) {
        term.write(e.payload.data)
      }
    },
  )
  // 监听会话退出
  unlistenExit = await listen<{ sessionId: number }>(
    'gitfast_pty_exit',
    (e) => {
      if (e.payload.sessionId === activeSessionId && term) {
        term.writeln('\r\n\x1b[31m[会话已退出]\x1b[0m')
      }
    },
  )

  // 用户键盘输入 → PTY
  term.onData((data) => {
    if (activeSessionId !== null) {
      ptyWrite(activeSessionId, data).catch((err) => {
        console.error('[ptyWrite]', err)
      })
    }
  })

  // 容器尺寸变化 → fit + resize PTY
  resizeObserver = new ResizeObserver(() => {
    if (!term || !fitAddon) return
    fitAddon.fit()
    if (activeSessionId !== null) {
      ptyResize(activeSessionId, term.cols, term.rows).catch(() => {})
    }
  })
  resizeObserver.observe(containerRef.value)
}

function clearScreen() {
  term?.clear()
}

// 主题切换时更新终端配色
watch(() => theme.mode, () => {
  if (term) term.options.theme = getThemeColors()
})

onMounted(() => {
  initTerminal().catch((err) => {
    console.error('[initTerminal]', err)
  })
})

onBeforeUnmount(() => {
  unlistenOutput?.()
  unlistenExit?.()
  resizeObserver?.disconnect()
  term?.dispose()
  // 关闭 PTY 会话
  if (props.repoId) {
    store.closeSession(props.repoId).catch(() => {})
  }
})

defineExpose({ clearScreen })
</script>

<template>
  <div class="terminal-wrapper">
    <div ref="containerRef" class="terminal-container"></div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  flex: 1;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
.terminal-container {
  flex: 1;
  height: 100%;
  padding: 4px 6px;
}
.terminal-container :deep(.xterm) {
  height: 100%;
}
</style>
