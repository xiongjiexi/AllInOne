<script setup lang="ts">
import { ref } from 'vue'
import JsonPanel from './JsonPanel.vue'
import UnicodePanel from './UnicodePanel.vue'
import DiffPanel from './DiffPanel.vue'

type SubView = 'json' | 'unicode' | 'diff'

const tabs: { id: SubView; label: string; icon: string }[] = [
  { id: 'json', label: 'JSON', icon: '{}' },
  { id: 'unicode', label: 'Unicode', icon: 'U+' },
  { id: 'diff', label: '对比', icon: '⇄' },
]

const current = ref<SubView>(localStorage.getItem('allinone-textutils-tab') as SubView || 'json')

function switchTo(id: SubView) {
  current.value = id
  localStorage.setItem('allinone-textutils-tab', id)
}
</script>

<template>
  <div class="textutils-tool">
    <div class="subtoolbar">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="sub-tab"
        :class="{ active: current === t.id }"
        @click="switchTo(t.id)"
      >
        <span class="sub-icon">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </button>
    </div>

    <div class="sub-body">
      <JsonPanel v-show="current === 'json'" />
      <UnicodePanel v-show="current === 'unicode'" />
      <DiffPanel v-show="current === 'diff'" />
    </div>
  </div>
</template>

<style scoped>
.textutils-tool {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.subtoolbar {
  display: flex;
  gap: 2px;
  padding: 6px 16px 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  flex-shrink: 0;
}
.sub-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: transparent;
  color: var(--text-soft);
  font-size: 12px;
  transition: all 0.15s;
}
.sub-tab:hover {
  color: var(--text);
  background: var(--bg-soft);
}
.sub-tab.active {
  background: var(--bg);
  color: var(--accent);
  border-color: var(--border);
  position: relative;
}
.sub-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--bg);
}
.sub-icon {
  font-family: monospace;
  font-size: 11px;
  font-weight: 600;
}
.sub-body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
}
</style>
