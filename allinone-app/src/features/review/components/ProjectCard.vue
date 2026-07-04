<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useReviewStore, type ProjectRuntime } from '../stores/review'
import type { ReviewProject, ReviewLatestCommit } from '../types'
import { getLatestCommit } from '../lib/backend'
import BranchSelector from './BranchSelector.vue'

const props = defineProps<{
  project: ReviewProject
  expanded: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-expand'): void
}>()

const store = useReviewStore()

const rt = computed<ProjectRuntime>(() => store.getRuntime(props.project.id))

// 表单状态
const srcBranch = ref('')
const destBranch = ref('')
const subject = ref('')
const showHistory = ref(false)
const logs = ref<{ file_name: string; task_id: string; timestamp: string; size: number }[]>([])
const logContent = ref('')
const logContentFileName = ref('')

// 源分支最新提交（展示用，用户自行选中复制）
const latestCommit = ref<ReviewLatestCommit | null>(null)
const commitLoading = ref(false)
const commitError = ref('')
// 提交信息缓存：分支名 → 提交信息（卡片展开期间有效，避免重复请求）
const commitCache = new Map<string, ReviewLatestCommit>()

/** 加载源分支最新提交（带缓存） */
async function loadLatestCommit(branch: string) {
  if (!branch) {
    latestCommit.value = null
    commitError.value = ''
    return
  }
  // 命中缓存
  if (commitCache.has(branch)) {
    latestCommit.value = commitCache.get(branch)!
    commitError.value = ''
    return
  }
  commitLoading.value = true
  commitError.value = ''
  try {
    const result = await getLatestCommit(props.project.repoPath, branch)
    commitCache.set(branch, result)
    latestCommit.value = result
  } catch (e: any) {
    latestCommit.value = null
    commitError.value = e?.message ?? String(e)
  } finally {
    commitLoading.value = false
  }
}

// 监听源分支变化，自动加载最新提交
watch(srcBranch, (branch) => {
  loadLatestCommit(branch)
})

// 推荐分支：合并当前分支、上游、最近本地分支（去重，过滤空值）
const suggestedBranches = computed<string[]>(() => {
  const list: string[] = []
  const seen = new Set<string>()
  const push = (b?: string) => {
    if (b && !seen.has(b)) {
      list.push(b)
      seen.add(b)
    }
  }
  // 当前分支最优先
  push(rt.value.currentBranch)
  // 最近本地分支
  rt.value.recentLocal.forEach(push)
  // 上游分支
  push(rt.value.upstream)
  return list
})

// 最近使用分支（来自 localStorage 持久化）
const recentBranches = computed<string[]>(() => store.getRecentBranches(props.project.id))

// 默认值：源分支用配置默认值 → 当前分支 → 上游分支；目标分支用配置默认值 → 上游分支
watch(() => props.expanded, (v) => {
  if (v) {
    // 源分支默认值优先级：配置 defaultSrcBranch > 当前分支 > 上游分支
    if (!srcBranch.value) {
      if (props.project.defaultSrcBranch) {
        srcBranch.value = props.project.defaultSrcBranch
      } else if (rt.value.currentBranch) {
        srcBranch.value = rt.value.currentBranch
      } else if (rt.value.upstream) {
        srcBranch.value = rt.value.upstream
      }
    }
    // 目标分支默认值优先级：配置 defaultDestBranch > 上游分支
    if (!destBranch.value) {
      if (props.project.defaultDestBranch) {
        destBranch.value = props.project.defaultDestBranch
      } else if (rt.value.upstream) {
        destBranch.value = rt.value.upstream
      }
    }
  }
})

// 当仓库状态加载完成时，自动填充未设置的默认值
watch(() => rt.value.currentBranch, (branch) => {
  if (props.expanded && !srcBranch.value && !props.project.defaultSrcBranch && branch) {
    srcBranch.value = branch
  }
})
watch(() => rt.value.upstream, (upstream) => {
  if (props.expanded && !destBranch.value && !props.project.defaultDestBranch && upstream) {
    destBranch.value = upstream
  }
})

// 评审标题默认值
const defaultSubject = computed(() => {
  const s = srcBranch.value || '<源分支>'
  const d = destBranch.value || '<目标分支>'
  return `Merge ${s} into ${d}`
})

// 注入的环境变量预览（用于结果面板展示过程，token 脱敏）
const envPreview = computed(() => {
  const project = props.project
  const lines = [
    `REPO_ID=${project.repoId}`,
    `FULL_NAME=${project.fullName}`,
    `SRC_BRANCH=${srcBranch.value || '<未填>'}`,
    `DEST_BRANCH=${destBranch.value || '<未填>'}`,
    `PLATFORM_URL=${store.config.platform.url}`,
    `ACCESS_TOKEN=${maskToken(store.config.platform.accessToken)}`,
  ]
  if (subject.value.trim()) {
    lines.push(`REVIEW_SUBJECT=${subject.value.trim()}`)
  }
  return lines.join('\n')
})

function maskToken(token: string): string {
  if (!token) return '<空>'
  if (token.length <= 8) return '****'
  return token.slice(0, 4) + '****' + token.slice(-4)
}

// HTML 转义，防止 v-html 注入
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 将文本中的 URL 转为可点击链接（先转义再链接化，避免 XSS）
function linkify(text: string): string {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  )
}

const canCreate = computed(() => {
  return srcBranch.value.trim() !== '' &&
         destBranch.value.trim() !== '' &&
         srcBranch.value !== destBranch.value &&
         !rt.value.running
})

async function createReview() {
  if (!canCreate.value) return
  await store.createReview({
    projectId: props.project.id,
    srcBranch: srcBranch.value.trim(),
    destBranch: destBranch.value.trim(),
    subject: subject.value.trim() || undefined,
  })
}

async function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value) {
    logs.value = await store.fetchLogs(props.project.id)
  }
}

async function viewLog(fileName: string) {
  logContentFileName.value = fileName
  logContent.value = await store.fetchLogContent(fileName)
}

async function removeLog(fileName: string) {
  await store.removeLog(fileName)
  logs.value = await store.fetchLogs(props.project.id)
  if (logContentFileName.value === fileName) {
    logContent.value = ''
    logContentFileName.value = ''
  }
}

function formatTime(ts: string): string {
  // ts 格式 YYYYMMDD_HHMMSS
  if (ts.length !== 15) return ts
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`
}

function formatLastRun(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="project-card" :class="{ expanded }">
    <!-- 卡片头部（点击展开/收起） -->
    <div class="card-header" @click="emit('toggle-expand')">
      <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
      <span class="project-name">{{ project.name }}</span>
      <span class="project-path">{{ project.repoPath }}</span>
      <span
        v-if="rt.lastResult"
        class="last-status"
        :class="rt.lastResult.success ? 'ok' : 'fail'"
      >
        {{ rt.lastResult.success ? '✓' : '✗' }} {{ formatLastRun(rt.lastRunAt) }}
      </span>
    </div>

    <!-- 展开内容 -->
    <div v-if="expanded" class="card-body">
      <div class="form-row">
        <label class="form-label">源分支</label>
        <BranchSelector
          v-model="srcBranch"
          :branches="rt.branches"
          :loading="rt.branchesLoading"
          :error="rt.branchesError"
          :recent="recentBranches"
          :suggested="suggestedBranches"
          :suggest-loading="rt.statusLoading"
          placeholder="选择或输入源分支"
          @retry="store.retryLoad(props.project.id)"
        />
      </div>

      <!-- 源分支最新提交（展示用，可选中复制） -->
      <div v-if="srcBranch" class="commit-info-row">
        <div class="commit-info-bar">
          <span class="commit-label">最新提交</span>
          <span v-if="commitLoading" class="commit-loading">加载中...</span>
          <span v-else-if="commitError" class="commit-error">⚠ {{ commitError }}</span>
          <span v-else-if="latestCommit" class="commit-content" user-select>
            <span class="commit-hash">{{ latestCommit.hash }}</span>
            <span class="commit-subject">{{ latestCommit.subject }}</span>
          </span>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">目标分支</label>
        <BranchSelector
          v-model="destBranch"
          :branches="rt.branches"
          :loading="rt.branchesLoading"
          :error="rt.branchesError"
          :recent="recentBranches"
          :suggested="suggestedBranches"
          :suggest-loading="rt.statusLoading"
          placeholder="选择或输入目标分支"
          @retry="store.retryLoad(props.project.id)"
        />
      </div>

      <div class="form-row">
        <label class="form-label">评审标题</label>
        <input
          v-model="subject"
          class="form-input"
          type="text"
          :placeholder="defaultSubject"
        />
      </div>

      <div class="form-actions">
        <button
          class="btn-primary"
          :disabled="!canCreate"
          @click="createReview"
        >
          {{ rt.running ? '创建中...' : '创建评审' }}
        </button>
        <button class="btn-ghost" @click="toggleHistory">
          {{ showHistory ? '隐藏历史' : '查看历史' }}
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="rt.branchesError" class="error-bar">
        分支加载失败：{{ rt.branchesError }}
      </div>

      <!-- 执行结果 -->
      <div v-if="rt.lastResult" class="result-panel" :class="rt.lastResult.success ? 'ok' : 'fail'">
        <div class="result-header">
          <span>{{ rt.lastResult.success ? '✓ 评审创建成功' : '✗ 创建失败' }}</span>
          <span class="result-meta">退出码 {{ rt.lastResult.exit_code }} · 耗时 {{ (rt.lastResult.duration_ms / 1000).toFixed(1) }}s</span>
        </div>

        <!-- 执行信息（过程可见） -->
        <div class="result-section">
          <div class="section-label">执行信息</div>
          <div class="exec-info">
            <div class="info-row"><span class="info-key">脚本</span><span class="info-val">{{ store.config.script }}</span></div>
            <div class="info-row"><span class="info-key">工作目录</span><span class="info-val">{{ project.repoPath }}</span></div>
            <div class="info-row"><span class="info-key">源分支</span><span class="info-val">{{ srcBranch || '<空>' }}</span></div>
            <div class="info-row"><span class="info-key">目标分支</span><span class="info-val">{{ destBranch || '<空>' }}</span></div>
          </div>
          <details class="env-details">
            <summary>注入的环境变量（token 已脱敏）</summary>
            <pre class="result-env">{{ envPreview }}</pre>
          </details>
        </div>

        <!-- stdout 输出 -->
        <div v-if="rt.lastResult.stdout" class="result-section">
          <div class="section-label">标准输出（stdout）</div>
          <pre class="result-stdout" v-html="linkify(rt.lastResult.stdout)"></pre>
        </div>

        <!-- stderr 输出 -->
        <div v-if="rt.lastResult.stderr" class="result-section">
          <div class="section-label">错误输出（stderr）</div>
          <pre class="result-stderr">{{ rt.lastResult.stderr }}</pre>
        </div>

        <!-- 空输出提示（极端情况：脚本未输出任何内容） -->
        <div v-if="!rt.lastResult.stdout && !rt.lastResult.stderr" class="result-section">
          <div class="empty-output">脚本未产生任何输出</div>
        </div>
      </div>

      <!-- 历史记录 -->
      <div v-if="showHistory" class="history-panel">
        <div class="history-header">历史记录（最近 50 条）</div>
        <div v-if="logs.length === 0" class="history-empty">暂无历史</div>
        <div v-else class="history-list">
          <div v-for="log in logs" :key="log.file_name" class="history-item">
            <span class="history-time">{{ formatTime(log.timestamp) }}</span>
            <span class="history-size">{{ log.size }}B</span>
            <button class="btn-link" @click="viewLog(log.file_name)">查看</button>
            <button class="btn-link danger" @click="removeLog(log.file_name)">删除</button>
          </div>
        </div>

        <!-- 日志内容 -->
        <div v-if="logContent" class="log-content">
          <div class="log-content-header">
            <span>{{ logContentFileName }}</span>
            <button class="btn-link" @click="logContent = ''">关闭</button>
          </div>
          <pre>{{ logContent }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  overflow: hidden;
  transition: border-color 0.15s;
}
.project-card.expanded {
  border-color: var(--accent);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}
.card-header:hover {
  background: var(--bg-soft);
}
.expand-icon {
  font-size: 10px;
  color: var(--text-muted);
  width: 12px;
}
.project-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.project-path {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.last-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}
.last-status.ok {
  color: #27ae60;
  background: rgba(39, 174, 96, 0.1);
}
.last-status.fail {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

.card-body {
  padding: 14px;
  border-top: 1px dashed var(--border);
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.form-label {
  width: 70px;
  font-size: 13px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.form-input {
  flex: 1;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  min-height: 28px;
}
.form-input:focus {
  outline: none;
  border-color: var(--accent);
}

/* 源分支最新提交信息条 */
.commit-info-row {
  margin: -4px 0 10px 80px;  /* 与 form-row 的 label 宽度对齐 */
}
.commit-info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: var(--bg-soft);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: 12px;
  min-height: 26px;
}
.commit-label {
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 11px;
}
.commit-loading {
  color: var(--text-muted);
  font-style: italic;
}
.commit-error {
  color: #e74c3c;
  font-size: 11px;
  word-break: break-all;
}
.commit-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}
.commit-hash {
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--accent);
  background: var(--bg);
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  font-size: 11px;
}
.commit-subject {
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.btn-primary {
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: white;
  font-size: 13px;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-ghost {
  padding: 6px 14px;
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

.error-bar {
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  font-size: 12px;
  border-radius: var(--radius-sm);
}

.result-panel {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.result-panel.ok {
  border-color: #27ae60;
}
.result-panel.fail {
  border-color: #e74c3c;
}
.result-header {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
}
.result-panel.ok .result-header {
  background: rgba(39, 174, 96, 0.1);
  color: #27ae60;
}
.result-panel.fail .result-header {
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
}
.result-duration {
  font-weight: normal;
  opacity: 0.7;
}
.result-meta {
  font-weight: normal;
  opacity: 0.7;
  font-size: 12px;
}
.result-body {
  padding: 8px 10px;
  max-height: 200px;
  overflow-y: auto;
}
.result-section {
  padding: 8px 10px;
  border-top: 1px dashed var(--border);
}
.section-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-weight: 500;
}
.exec-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.info-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
}
.info-key {
  color: var(--text-muted);
  min-width: 60px;
  flex-shrink: 0;
}
.info-val {
  color: var(--text);
  word-break: break-all;
}
.env-details {
  margin-top: 6px;
  font-size: 12px;
}
.env-details summary {
  cursor: pointer;
  color: var(--text-muted);
  user-select: none;
}
.env-details summary:hover {
  color: var(--accent);
}
.result-env {
  margin: 6px 0 0;
  padding: 8px;
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}
.result-stdout,
.result-stderr {
  margin: 0;
  padding: 8px;
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
}
.result-stdout {
  color: var(--text);
}
.result-stdout a {
  color: #4af;
  text-decoration: underline;
  cursor: pointer;
}
.result-stdout a:hover {
  color: #6cf;
}
.result-stderr {
  color: #e74c3c;
}
.empty-output {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.history-panel {
  margin-top: 14px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.history-header {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.history-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: var(--radius-sm);
}
.history-item:hover {
  background: var(--bg-soft);
}
.history-time {
  flex: 1;
  color: var(--text);
}
.history-size {
  color: var(--text-muted);
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
.btn-link.danger {
  color: #e74c3c;
}

.log-content {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.log-content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-soft);
  font-size: 12px;
  color: var(--text-muted);
}
.log-content pre {
  margin: 0;
  padding: 10px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  color: var(--text);
}
</style>
