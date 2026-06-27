<script setup lang="ts">
import { useThemeStore } from '../stores/theme'
import { useToolStore, type ToolId } from '../stores/tool'

const theme = useThemeStore()
const tool = useToolStore()

const tools: { id: ToolId; label: string; icon: string }[] = [
  { id: 'checklist', label: '清单', icon: '📋' },
  { id: 'gitfast', label: 'GitFast', icon: '⚡' },
]
</script>

<template>
  <div class="toolbar">
    <!-- 工具切换器 -->
    <div class="tool-switcher">
      <button
        v-for="t in tools"
        :key="t.id"
        class="tool-tab"
        :class="{ active: tool.current === t.id }"
        @click="tool.set(t.id)"
        :title="t.label"
      >
        <span class="tool-icon">{{ t.icon }}</span>
        <span class="tool-label">{{ t.label }}</span>
      </button>
    </div>

    <div class="spacer"></div>

    <button
      class="btn-icon btn-ghost"
      :title="theme.mode === 'dark' ? '切换到浅色' : '切换到深色'"
      @click="theme.toggle()"
    >
      <span v-if="theme.mode === 'dark'">☀️</span>
      <span v-else>🌙</span>
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  -webkit-app-region: drag;
}
.tool-switcher {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}
.tool-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-soft);
  font-size: 13px;
  transition: all 0.15s;
}
.tool-tab:hover {
  background: var(--bg-soft);
  color: var(--text);
}
.tool-tab.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}
.tool-icon {
  font-size: 13px;
}
.spacer {
  flex: 1;
}
.toolbar button {
  -webkit-app-region: no-drag;
}
</style>
