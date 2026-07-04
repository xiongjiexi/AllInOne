<script setup lang="ts">
import { ref } from 'vue'
import { useReviewStore } from '../stores/review'
import ProjectCard from './ProjectCard.vue'

const store = useReviewStore()

// 当前展开的项目 ID（手风琴模式，只展开一个）
const expandedId = ref<string>('')

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}

// 应用启动时自动加载上次配置
store.autoLoadLastConfig()
</script>

<template>
  <div class="review-tool">
    <!-- 顶部工具栏 -->
    <div class="review-header">
      <div class="header-left">
        <span class="title">🔀 代码评审</span>
        <span v-if="store.loaded && store.configPath" class="config-path">
          {{ store.configPath }}
        </span>
      </div>
      <div class="header-actions">
        <button class="btn-ghost btn-sm" @click="store.pickAndLoadConfig()">
          切换配置
        </button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.error" class="error-bar">
      {{ store.error }}
      <button class="btn-link" @click="store.error = ''">✕</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!store.loaded" class="empty-state">
      <div class="empty-icon">🔀</div>
      <div class="empty-title">未加载配置</div>
      <div class="empty-desc">请选择 YAML 配置文件以加载项目列表</div>
      <button class="btn-primary" @click="store.pickAndLoadConfig()">
        选择配置文件
      </button>
    </div>

    <!-- 项目列表 -->
    <div v-else-if="store.projects.length > 0" class="project-list">
      <ProjectCard
        v-for="project in store.projects"
        :key="project.id"
        :project="project"
        :expanded="expandedId === project.id"
        @toggle-expand="toggleExpand(project.id)"
      />
    </div>

    <!-- 配置已加载但无项目 -->
    <div v-else class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-title">无项目</div>
      <div class="empty-desc">配置文件中未定义任何项目</div>
    </div>
  </div>
</template>

<style scoped>
.review-tool {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-soft);
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.config-path {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-actions {
  display: flex;
  gap: 6px;
}

.error-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  font-size: 13px;
  border-bottom: 1px solid rgba(231, 76, 60, 0.3);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}
.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
}
.empty-desc {
  font-size: 13px;
  margin-bottom: 16px;
}

.btn-primary {
  padding: 8px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: white;
  font-size: 13px;
  cursor: pointer;
}
.btn-primary:hover {
  opacity: 0.9;
}

.btn-ghost {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.btn-ghost:hover {
  background: var(--bg-soft);
}
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-link {
  padding: 2px 8px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}
.btn-link:hover {
  text-decoration: underline;
}
</style>
