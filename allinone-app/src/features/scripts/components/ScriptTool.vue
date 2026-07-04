<template>
  <div class="script-tool">
    <!-- 顶部操作栏 -->
    <div class="topbar">
      <div class="left">
        <span class="title">📜 Script Runner</span>
        <span v-if="store.loaded" class="config-path">{{ store.configPath }}</span>
      </div>
      <div class="right">
        <button class="btn" @click="store.pickAndLoadConfig">📁 加载配置</button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.error" class="error">{{ store.error }}</div>

    <!-- 未加载 / 空任务 -->
    <div v-if="!store.loaded" class="empty">
      <p>请加载配置文件以开始使用</p>
      <pre class="yaml-example">{{ YAML_EXAMPLE }}</pre>
    </div>
    <div v-else-if="store.tasks.length === 0" class="empty">
      <p>配置文件中没有任务，请在配置文件中添加 tasks</p>
      <pre class="yaml-example">{{ YAML_EXAMPLE }}</pre>
    </div>

    <!-- 任务列表 -->
    <div v-else class="task-list">
      <div v-for="task in store.tasks" :key="task.id" class="task-card">
        <div class="task-header">
          <span class="task-name">⏰ {{ task.name }}</span>
          <span
            class="badge"
            :class="store.isTaskEnabled(task) ? 'badge-on' : 'badge-off'"
            @click="store.toggleEnabled(task)"
            :title="store.isTaskEnabled(task) ? '点击停用' : '点击启用'"
          >
            {{ store.isTaskEnabled(task) ? '启用' : '停用' }}
          </span>
        </div>
        <div class="task-meta">
          <div class="meta-row"><span class="label">📜 脚本：</span>{{ task.script }}</div>
          <div class="meta-row"><span class="label">📂 目录：</span>{{ task.workdir || '（脚本所在目录）' }}</div>
          <div class="meta-row">
            <span class="label">🕒 规则：</span>
            <span v-if="task.rule.type === 'daily'">每天 {{ task.rule.time }}</span>
            <span v-else>每 {{ task.rule.minutes }} 分钟</span>
          </div>
          <div class="meta-row" v-if="task.timeout">
            <span class="label">⏱ 超时：</span>{{ task.timeout }} 秒
          </div>
        </div>
        <div class="task-last" v-if="store.getRuntime(task.id).lastResult">
          <span class="label">上次：</span>
          <span :class="store.getRuntime(task.id).lastResult!.success ? 'ok' : 'fail'">
            {{ store.getRuntime(task.id).lastResult!.success ? '✓' : '✗' }}
          </span>
          <span class="last-time">{{ formatLastRun(store.getRuntime(task.id).lastRunAt) }}</span>
          <span class="last-duration">({{ (store.getRuntime(task.id).lastResult!.duration_ms / 1000).toFixed(1) }}s)</span>
          <pre class="last-output" v-if="store.getRuntime(task.id).lastResult!.stderr">{{
            store.getRuntime(task.id).lastResult!.stderr
          }}</pre>
        </div>
        <div class="task-actions">
          <button
            class="btn btn-primary"
            :disabled="store.getRuntime(task.id).running"
            @click="store.runOnce(task)"
          >
            {{ store.getRuntime(task.id).running ? '⏳ 执行中...' : '▶ 立即执行' }}
          </button>
          <button class="btn" @click="openLogs(task)">📋 查看日志</button>
        </div>
      </div>
    </div>

    <!-- 日志面板（弹层） -->
    <div v-if="logsPanel.visible" class="logs-panel-overlay" @click.self="closeLogs">
      <div class="logs-panel">
        <div class="logs-header">
          <span class="logs-title">📋 {{ logsPanel.taskName }} 的日志</span>
          <button class="btn btn-close" @click="closeLogs">✕</button>
        </div>
        <div class="logs-body">
          <div v-if="logsPanel.loading" class="logs-loading">加载中...</div>
          <div v-else-if="logsPanel.entries.length === 0" class="logs-empty">暂无日志</div>
          <div v-else class="logs-list">
            <div v-for="entry in logsPanel.entries" :key="entry.file_name" class="log-entry">
              <div class="log-entry-header" @click="toggleLogContent(entry.file_name)">
                <span class="log-time">{{ formatLogTimestamp(entry.timestamp) }}</span>
                <span class="log-size">{{ formatSize(entry.size) }}</span>
                <button class="btn btn-small" @click.stop="openLogContent(entry.file_name)">查看</button>
                <button class="btn btn-small btn-danger" @click.stop="removeLogEntry(entry.file_name)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 日志内容查看（弹层） -->
    <div v-if="logContentPanel.visible" class="log-content-overlay" @click.self="closeLogContent">
      <div class="log-content-panel">
        <div class="log-content-header">
          <span class="log-content-title">📄 {{ logContentPanel.fileName }}</span>
          <button class="btn btn-close" @click="closeLogContent">✕</button>
        </div>
        <pre class="log-content-body">{{ logContentPanel.content }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useScriptsStore } from '../stores/scripts'
import type { ScriptTask, ScriptLogEntry } from '../types'

const store = useScriptsStore()

// 启动时自动加载上次配置
store.autoLoadOnStartup()

const YAML_EXAMPLE = `version: 1
logDir: D:/Jesse/allinone/logs   # 日志目录（默认配置文件同目录的 logs/）
tasks:
  - id: daily-pull
    name: 每日拉取
    script: D:/scripts/deploy.sh
    workdir: D:/Jesse/allinone
    rule:
      type: daily
      time: "09:00"
    enabled: true
    timeout: 60

  - id: interval-build
    name: 每30分钟构建
    script: D:/scripts/build.bat
    workdir: D:/Jesse/project
    rule:
      type: interval
      minutes: 30
    enabled: false`

// 日志列表面板
const logsPanel = reactive({
  visible: false,
  taskName: '',
  taskId: '',
  loading: false,
  entries: [] as ScriptLogEntry[],
})

async function openLogs(task: ScriptTask) {
  logsPanel.visible = true
  logsPanel.taskName = task.name
  logsPanel.taskId = task.id
  logsPanel.loading = true
  logsPanel.entries = []
  try {
    logsPanel.entries = await store.fetchLogs(task.id)
  } finally {
    logsPanel.loading = false
  }
}

function closeLogs() {
  logsPanel.visible = false
}

async function removeLogEntry(fileName: string) {
  await store.removeLog(fileName)
  logsPanel.entries = await store.fetchLogs(logsPanel.taskId)
}

// 日志内容面板
const logContentPanel = reactive({
  visible: false,
  fileName: '',
  content: '',
})

async function openLogContent(fileName: string) {
  logContentPanel.visible = true
  logContentPanel.fileName = fileName
  logContentPanel.content = '加载中...'
  try {
    logContentPanel.content = await store.fetchLogContent(fileName)
  } catch (e: any) {
    logContentPanel.content = `读取失败: ${e?.message ?? e}`
  }
}

function closeLogContent() {
  logContentPanel.visible = false
}

function toggleLogContent(fileName: string) {
  openLogContent(fileName)
}

// 格式化辅助
function formatLastRun(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatLogTimestamp(ts: string): string {
  // ts 格式 YYYYMMDD_HHMMSS
  if (ts.length !== 15) return ts
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
</script>

<style scoped>
.script-tool {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar .left { display: flex; align-items: center; gap: 12px; }
.topbar .title { font-weight: 600; font-size: 16px; }
.topbar .config-path { font-size: 12px; color: var(--text-muted); }

.btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover:not(:disabled) { background: var(--bg-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: white; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-close { padding: 4px 8px; }
.btn-small { padding: 2px 8px; font-size: 12px; }
.btn-danger { color: var(--danger, #e74c3c); border-color: var(--danger, #e74c3c); }

.error {
  padding: 8px 16px;
  background: #fde8e8;
  color: #c0392b;
  border-bottom: 1px solid #f5c6cb;
  font-size: 13px;
}

.empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
}
.yaml-example {
  text-align: left;
  margin: 16px auto;
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  max-width: 600px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  color: var(--text);
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card {
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.task-name { font-weight: 600; font-size: 15px; }
.badge {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.badge-on { background: #27ae60; color: white; }
.badge-off { background: #95a5a6; color: white; }

.task-meta { font-size: 13px; line-height: 1.8; }
.meta-row { display: flex; align-items: center; gap: 4px; }
.label { color: var(--text-muted); min-width: 70px; }

.task-last {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  font-size: 13px;
}
.ok { color: #27ae60; font-weight: 600; }
.fail { color: #e74c3c; font-weight: 600; }
.last-time, .last-duration { color: var(--text-muted); margin-left: 8px; }
.last-output {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  color: #e74c3c;
}

.task-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

/* 日志面板 */
.logs-panel-overlay, .log-content-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.logs-panel, .log-content-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 80%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.logs-header, .log-content-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.logs-title, .log-content-title { font-weight: 600; }
.logs-body { padding: 12px 16px; overflow-y: auto; flex: 1; }
.logs-loading, .logs-empty { color: var(--text-muted); text-align: center; padding: 20px; }
.logs-list { display: flex; flex-direction: column; gap: 4px; }
.log-entry {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-elevated);
}
.log-entry-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.log-time { font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; }
.log-size { color: var(--text-muted); font-size: 12px; }

.log-content-body {
  padding: 16px;
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-y: auto;
  flex: 1;
  color: var(--text);
}
</style>
