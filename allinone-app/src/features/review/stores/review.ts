// Code Review 状态管理

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReviewConfig, ReviewProject, ReviewRunResult, ReviewLogEntry, ReviewRepoStatus } from '../types'
import { DEFAULT_CONFIG } from '../lib/defaultConfig'
import { loadConfigFile, pickConfigFile } from '../lib/configLoader'
import { runReviewScript, listBranches, listLogs, readLog, deleteLog, getRepoStatus } from '../lib/backend'

const CONFIG_PATH_KEY = 'allinone-review-config-path'
const RECENT_BRANCHES_KEY = 'allinone-review-recent-branches'

/** 每个项目保留的最近使用分支数 */
const MAX_RECENT = 5

/** 从 localStorage 读取最近使用分支记录 */
function loadRecentMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(RECENT_BRANCHES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** 项目运行时状态（内存，不持久化） */
export interface ProjectRuntime {
  /** 分支列表（全量，已去重） */
  branches: string[]
  /** 分支列表加载中 */
  branchesLoading: boolean
  /** 分支列表加载错误 */
  branchesError: string
  /** 仓库状态加载中（轻量，先于 branches 完成） */
  statusLoading: boolean
  /** 仓库状态加载错误 */
  statusError: string
  /** 当前分支（git rev-parse --abbrev-ref HEAD） */
  currentBranch: string
  /** 上游分支 */
  upstream: string
  /** 最近本地分支（git for-each-ref 取 5 条） */
  recentLocal: string[]
  /** 正在创建评审 */
  running: boolean
  /** 上次执行结果 */
  lastResult: ReviewRunResult | null
  /** 上次执行时间戳 */
  lastRunAt: number | null
}

export const useReviewStore = defineStore('review', () => {
  const config = ref<ReviewConfig>({ ...DEFAULT_CONFIG })
  const configPath = ref<string>(localStorage.getItem(CONFIG_PATH_KEY) ?? '')
  const loaded = ref(false)
  const error = ref<string>('')

  // 项目运行时状态
  const runtimes = ref<Map<string, ProjectRuntime>>(new Map())

  // 最近使用分支记录：{ projectId: string[] }，localStorage 持久化
  const recentMap = ref<Record<string, string[]>>(loadRecentMap())

  // ============ 计算属性 ============

  const projects = computed(() => config.value.projects)
  const logDir = computed(() => config.value.logDir ?? '')

  function getRuntime(projectId: string): ProjectRuntime {
    if (!runtimes.value.has(projectId)) {
      runtimes.value.set(projectId, {
        branches: [],
        branchesLoading: false,
        branchesError: '',
        statusLoading: false,
        statusError: '',
        currentBranch: '',
        upstream: '',
        recentLocal: [],
        running: false,
        lastResult: null,
        lastRunAt: null,
      })
    }
    return runtimes.value.get(projectId)!
  }

  /** 获取某项目的最近使用分支（来自 localStorage） */
  function getRecentBranches(projectId: string): string[] {
    return recentMap.value[projectId] ?? []
  }

  /** 记录一次分支使用，更新最近列表（保持最新在前，去重，限 MAX_RECENT 条） */
  function pushRecentBranch(projectId: string, branch: string) {
    if (!branch) return
    const list = recentMap.value[projectId] ?? []
    const filtered = list.filter(b => b !== branch)
    filtered.unshift(branch)
    const next = filtered.slice(0, MAX_RECENT)
    recentMap.value = { ...recentMap.value, [projectId]: next }
    try {
      localStorage.setItem(RECENT_BRANCHES_KEY, JSON.stringify(recentMap.value))
    } catch {
      // 静默失败，不影响主流程
    }
  }

  function getProject(projectId: string): ReviewProject | undefined {
    return config.value.projects.find(p => p.id === projectId)
  }

  // ============ 配置加载 ============

  async function loadConfig(path?: string) {
    const p = path ?? configPath.value
    if (!p) {
      error.value = '未指定配置文件路径'
      return
    }
    try {
      const cfg = await loadConfigFile(p)
      config.value = cfg
      configPath.value = p
      loaded.value = true
      error.value = ''
      localStorage.setItem(CONFIG_PATH_KEY, p)
      // 清空旧运行时
      runtimes.value.clear()
      // 后台预加载所有项目的仓库状态 + 分支列表（不阻塞 loadConfig 返回）
      for (const proj of cfg.projects) {
        preloadProject(proj.id)
      }
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      loaded.value = false
    }
  }

  /** 后台预加载：先拉仓库状态（轻量），再拉分支列表（重量） */
  function preloadProject(projectId: string) {
    const project = getProject(projectId)
    if (!project) return
    // 仓库状态
    loadRepoStatus(projectId)
    // 分支列表：若配置了 defaultSrcBranch，可跳过（但为支持下拉仍加载）
    loadBranches(projectId)
  }

  async function pickAndLoadConfig() {
    const p = await pickConfigFile()
    if (!p) return
    await loadConfig(p)
  }

  async function autoLoadLastConfig() {
    if (configPath.value) {
      await loadConfig(configPath.value)
    }
  }

  // ============ 仓库状态 + 分支列表 ============

  /** 加载仓库状态（轻量：当前分支、上游、最近本地分支），用于快速填充默认值 */
  async function loadRepoStatus(projectId: string) {
    const project = getProject(projectId)
    if (!project) return
    const rt = getRuntime(projectId)
    rt.statusLoading = true
    rt.statusError = ''
    try {
      const status: ReviewRepoStatus = await getRepoStatus(project.repoPath)
      rt.currentBranch = status.current_branch
      rt.upstream = status.upstream
      rt.recentLocal = status.recent_local
    } catch (e: any) {
      rt.statusError = e?.message ?? String(e)
    } finally {
      rt.statusLoading = false
    }
  }

  /** 加载项目分支列表（重量：全量分支） */
  async function loadBranches(projectId: string) {
    const project = getProject(projectId)
    if (!project) return
    const rt = getRuntime(projectId)
    if (rt.branchesLoading) return  // 防重入
    rt.branchesLoading = true
    rt.branchesError = ''
    try {
      const branches = await listBranches(project.repoPath)
      rt.branches = branches
    } catch (e: any) {
      rt.branchesError = e?.message ?? String(e)
      rt.branches = []
    } finally {
      rt.branchesLoading = false
    }
  }

  /** 重试加载（清除错误后重新加载） */
  async function retryLoad(projectId: string) {
    await Promise.all([
      loadRepoStatus(projectId),
      loadBranches(projectId),
    ])
  }

  // ============ 评审创建 ============

  /** 创建评审：组装环境变量 → 调用脚本 → 记录结果 */
  async function createReview(params: {
    projectId: string
    srcBranch: string
    destBranch: string
    subject?: string
  }): Promise<ReviewRunResult> {
    const project = getProject(params.projectId)
    if (!project) {
      throw new Error(`项目不存在: ${params.projectId}`)
    }
    const rt = getRuntime(params.projectId)
    if (rt.running) {
      throw new Error('正在执行中，请稍候')
    }

    rt.running = true
    try {
      const env: Record<string, string> = {
        REPO_ID: project.repoId,
        FULL_NAME: project.fullName,
        SRC_BRANCH: params.srcBranch,
        DEST_BRANCH: params.destBranch,
        PLATFORM_URL: config.value.platform.url,
        ACCESS_TOKEN: config.value.platform.accessToken,
      }
      if (params.subject) {
        env.REVIEW_SUBJECT = params.subject
      }

      const result = await runReviewScript({
        script: config.value.script,
        workdir: project.repoPath,
        timeoutSecs: 60,
        logDir: logDir.value,
        taskId: project.id,
        taskName: project.name,
        trigger: 'manual',
        env,
      })
      rt.lastResult = result
      rt.lastRunAt = Date.now()
      // 创建成功后记录最近使用的源/目标分支
      if (result.success) {
        pushRecentBranch(params.projectId, params.srcBranch)
        pushRecentBranch(params.projectId, params.destBranch)
      }
      return result
    } catch (e: any) {
      const result: ReviewRunResult = {
        success: false,
        exit_code: -1,
        duration_ms: 0,
        stdout: '',
        stderr: e?.message ?? String(e),
      }
      rt.lastResult = result
      rt.lastRunAt = Date.now()
      return result
    } finally {
      rt.running = false
    }
  }

  // ============ 日志 ============

  async function fetchLogs(projectId: string): Promise<ReviewLogEntry[]> {
    if (!logDir.value) return []
    return await listLogs(logDir.value, projectId)
  }

  async function fetchLogContent(fileName: string): Promise<string> {
    return await readLog(logDir.value, fileName)
  }

  async function removeLog(fileName: string): Promise<void> {
    await deleteLog(logDir.value, fileName)
  }

  return {
    // 状态
    config,
    configPath,
    loaded,
    error,
    projects,
    logDir,
    runtimes,
    recentMap,
    // 计算辅助
    getRuntime,
    getProject,
    getRecentBranches,
    pushRecentBranch,
    // 配置
    loadConfig,
    pickAndLoadConfig,
    autoLoadLastConfig,
    // 分支与仓库状态
    loadBranches,
    loadRepoStatus,
    preloadProject,
    retryLoad,
    // 评审
    createReview,
    // 日志
    fetchLogs,
    fetchLogContent,
    removeLog,
  }
})
