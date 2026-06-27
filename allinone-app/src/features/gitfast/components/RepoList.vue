<script setup lang="ts">
import { ref } from 'vue'
import { useGitFastStore } from '../stores/gitfast'
import type { Repository } from '../types'

const store = useGitFastStore()

// 分组折叠状态（id → 是否展开），持久化到 localStorage
const LS_COLLAPSE = 'allinone-gitfast-collapsed-groups'
const collapsed = ref<Set<string>>(new Set(loadCollapsed()))
function loadCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(LS_COLLAPSE)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function persistCollapsed() {
  localStorage.setItem(LS_COLLAPSE, JSON.stringify([...collapsed.value]))
}
function toggleGroup(gid: string) {
  const s = new Set(collapsed.value)
  if (s.has(gid)) s.delete(gid)
  else s.add(gid)
  collapsed.value = s
  persistCollapsed()
}
function isCollapsed(gid: string): boolean {
  return collapsed.value.has(gid)
}

function selectRepo(repo: Repository) {
  store.selectRepo(repo.id)
}
</script>

<template>
  <aside class="repo-list">
    <div class="list-header">
      <span class="title">仓库</span>
    </div>

    <div class="group-list">
      <div v-for="entry in store.reposByGroup" :key="entry.group?.id ?? '__ungrouped__'" class="group">
        <div
          class="group-header"
          @click="toggleGroup(entry.group?.id ?? '__ungrouped__')"
        >
          <span class="caret">{{ isCollapsed(entry.group?.id ?? '__ungrouped__') ? '▶' : '▼' }}</span>
          <span class="group-name">
            {{ entry.group?.name ?? '未分组' }}
          </span>
          <span class="group-count">{{ entry.repos.length }}</span>
        </div>
        <div v-show="!isCollapsed(entry.group?.id ?? '__ungrouped__')" class="group-body">
          <div
            v-for="repo in entry.repos"
            :key="repo.id"
            class="repo-item"
            :class="{ active: store.selectedRepoId === repo.id }"
            :title="repo.path"
            @click="selectRepo(repo)"
          >
            <span class="repo-icon">📦</span>
            <span class="repo-name">{{ repo.name }}</span>
          </div>
          <div v-if="entry.repos.length === 0" class="empty-group">（空）</div>
        </div>
      </div>

      <div v-if="store.repositories.length === 0" class="empty-list">
        <div class="empty-icon">📂</div>
        <div>暂无仓库</div>
        <div class="empty-hint">
          请点击右上方"加载配置文件"按钮，选择一个 YAML 配置文件
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.repo-list {
  width: 260px;
  min-width: 260px;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-header {
  padding: 14px 14px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.list-header .title {
  font-weight: 600;
  font-size: 15px;
}
.group-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 12px;
}
.group {
  margin-bottom: 4px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 12px;
  user-select: none;
}
.group-header:hover {
  background: var(--bg-soft);
}
.caret {
  width: 10px;
  display: inline-block;
  font-size: 10px;
}
.group-name {
  flex: 1;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.group-count {
  color: var(--text-muted);
  font-size: 11px;
}
.group-body {
  padding: 2px 0;
}
.repo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 28px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-soft);
  border-left: 2px solid transparent;
}
.repo-item:hover {
  background: var(--bg-soft);
}
.repo-item.active {
  background: var(--accent-soft);
  color: var(--text);
  border-left-color: var(--accent);
}
.repo-icon {
  font-size: 12px;
  opacity: 0.8;
}
.repo-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty-group {
  padding: 4px 14px 4px 28px;
  color: var(--text-muted);
  font-size: 11px;
}
.empty-list {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-icon {
  font-size: 36px;
  opacity: 0.5;
}
.empty-hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>
