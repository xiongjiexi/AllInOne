<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGitFastStore } from '../stores/gitfast'
import RepoList from './RepoList.vue'
import TerminalPanel from './TerminalPanel.vue'
import TemplateBar from './TemplateBar.vue'
import CommandInput from './CommandInput.vue'

const store = useGitFastStore()

// 当前选中仓库的 PTY sessionId（从 store.sessions 派生）
const currentSessionId = computed<number | null>(() => {
  if (!store.selectedRepoId) return null
  return store.sessions.get(store.selectedRepoId)?.sessionId ?? null
})

const currentRepoPath = computed<string>(() => {
  return store.selectedRepo?.path ?? ''
})

// 终端面板的 key：切换仓库时强制重建终端（P1 才做"切换时保留输出"，P0 直接重建）
const terminalKey = computed(() => store.selectedRepoId || '__empty__')

// 终端面板实例引用，用于清屏
const terminalRef = ref<InstanceType<typeof TerminalPanel> | null>(null)

function clearTerminal() {
  terminalRef.value?.clearScreen()
}

// 应用启动时自动加载上次配置
store.autoLoadLastConfig()

// 选中仓库变化时打印日志（调试用，可移除）
watch(() => store.selectedRepoId, (id) => {
  if (id) console.debug('[GitFast] selected repo:', id)
})
</script>

<template>
  <div class="gitfast-tool">
    <RepoList />

    <main class="gitfast-main">
      <!-- 顶部条：配置加载 + 当前仓库 + 清屏 -->
      <header class="gf-header">
        <div class="header-left">
          <button
            class="btn btn-sm"
            :disabled="store.configLoading"
            @click="store.chooseAndLoadConfig()"
            title="选择 YAML 配置文件加载"
          >
            📁 {{ store.configFilePath ? '切换配置' : '加载配置' }}
          </button>
          <span v-if="store.configFilePath" class="config-path" :title="store.configFilePath">
            {{ store.configFilePath }}
          </span>
        </div>
        <div class="header-right">
          <span v-if="store.selectedRepo" class="current-repo">
            {{ store.selectedRepo.name }}
          </span>
          <button
            class="btn btn-sm btn-ghost"
            :disabled="!currentSessionId"
            @click="clearTerminal"
            title="清屏"
          >
            🗑 清屏
          </button>
        </div>
      </header>

      <!-- 错误提示 -->
      <div v-if="store.configError" class="error-bar">
        {{ store.configError }}
        <button class="btn-ghost btn-sm" @click="store.configError = ''">✕</button>
      </div>

      <!-- 终端区域 -->
      <div class="terminal-area">
        <div v-if="!store.selectedRepo" class="empty">
          <div class="empty-icon">⚡</div>
          <div>请从左侧选择一个仓库</div>
          <div class="empty-hint" v-if="store.repositories.length === 0">
            没有仓库？点击上方"加载配置"选择 YAML 配置文件
          </div>
        </div>
        <TerminalPanel
          v-else
          :key="terminalKey"
          ref="terminalRef"
          :repo-id="store.selectedRepoId"
        />
      </div>

      <!-- 模板按钮栏 -->
      <TemplateBar
        :session-id="currentSessionId"
        :repo-path="currentRepoPath"
      />

      <!-- 单条命令输入 -->
      <CommandInput :session-id="currentSessionId" />
    </main>
  </div>
</template>

<style scoped>
.gitfast-tool {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}
.gitfast-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}
.gf-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.config-path {
  font-size: 11px;
  color: var(--text-muted);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-repo {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  padding: 2px 10px;
  background: var(--accent-soft);
  border-radius: var(--radius-sm);
}
.error-bar {
  margin: 8px 12px 0;
  padding: 8px 12px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.terminal-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 12px;
}
.empty-icon {
  font-size: 48px;
  opacity: 0.4;
}
.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>
