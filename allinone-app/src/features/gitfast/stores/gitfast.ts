// GitFast 全局状态
// 管理：当前生效配置、配置文件路径、当前选中仓库、各仓库 PTY 会话

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GitFastConfig, Repository, RepoGroup, CommandTemplate } from '../types'
import { DEFAULT_CONFIG } from '../lib/defaultConfig'
import { pickConfigFile, loadConfigFile } from '../lib/configLoader'
import { ptySpawn, ptyKill } from '../lib/backend'

const LS_CONFIG_PATH = 'allinone-gitfast-config-path'

/** 单仓库 PTY 会话信息（前端侧） */
interface RepoSession {
  repoId: string
  sessionId: number
}

export const useGitFastStore = defineStore('gitfast', () => {
  // ===== state =====
  const config = ref<GitFastConfig>(structuredClone(DEFAULT_CONFIG))
  const configFilePath = ref<string>(localStorage.getItem(LS_CONFIG_PATH) ?? '')
  const configLoading = ref<boolean>(false)
  const configError = ref<string>('')

  const selectedRepoId = ref<string>('')
  const sessions = ref<Map<string, RepoSession>>(new Map()) // repoId → session

  // ===== getters =====
  const groups = computed<RepoGroup[]>(() => config.value.groups)
  const repositories = computed<Repository[]>(() => config.value.repositories)
  const templates = computed<CommandTemplate[]>(() => config.value.templates)

  /** 按分组归类的仓库列表 */
  const reposByGroup = computed<{ group: RepoGroup | null; repos: Repository[] }[]>(() => {
    const map = new Map<string, Repository[]>()
    for (const r of config.value.repositories) {
      const gid = r.groupId ?? ''
      if (!map.has(gid)) map.set(gid, [])
      map.get(gid)!.push(r)
    }
    // 已声明但无仓库的分组也要显示（方便添加仓库时选）
    const result: { group: RepoGroup | null; repos: Repository[] }[] = []
    for (const g of config.value.groups) {
      result.push({ group: g, repos: map.get(g.id) ?? [] })
    }
    // 未归组的仓库
    const ungrouped = map.get('') ?? []
    if (ungrouped.length > 0) {
      result.push({ group: null, repos: ungrouped })
    }
    return result
  })

  const selectedRepo = computed<Repository | null>(() => {
    if (!selectedRepoId.value) return null
    return config.value.repositories.find(r => r.id === selectedRepoId.value) ?? null
  })

  // ===== actions =====

  /** 加载用户选择的配置文件 */
  async function chooseAndLoadConfig(): Promise<boolean> {
    configLoading.value = true
    configError.value = ''
    try {
      const path = await pickConfigFile()
      if (!path) return false
      await loadAndApplyConfig(path)
      return true
    } catch (e: any) {
      configError.value = e?.message ?? String(e)
      return false
    } finally {
      configLoading.value = false
    }
  }

  /** 加载指定路径的配置文件并应用 */
  async function loadAndApplyConfig(path: string): Promise<void> {
    configError.value = ''
    try {
      const cfg = await loadConfigFile(path)
      config.value = cfg
      configFilePath.value = path
      localStorage.setItem(LS_CONFIG_PATH, path)
      // 选中状态失效则清空
      if (selectedRepoId.value && !cfg.repositories.find(r => r.id === selectedRepoId.value)) {
        selectedRepoId.value = ''
      }
    } catch (e: any) {
      configError.value = e?.message ?? String(e)
      throw e
    }
  }

  /** 应用启动时自动加载上次的配置文件 */
  async function autoLoadLastConfig(): Promise<void> {
    if (!configFilePath.value) return
    try {
      await loadAndApplyConfig(configFilePath.value)
    } catch {
      // 加载失败保持默认配置，错误消息已写入 configError
    }
  }

  function selectRepo(repoId: string) {
    selectedRepoId.value = repoId
  }

  /** 为指定仓库启动 PTY 会话；若已存在则复用 */
  async function ensureSession(repoId: string, repoPath: string): Promise<number> {
    const existing = sessions.value.get(repoId)
    if (existing) return existing.sessionId
    const sessionId = await ptySpawn(repoPath)
    sessions.value.set(repoId, { repoId, sessionId })
    // Map 的引用变更触发响应式
    sessions.value = new Map(sessions.value)
    return sessionId
  }

  /** 关闭指定仓库的 PTY 会话 */
  async function closeSession(repoId: string): Promise<void> {
    const s = sessions.value.get(repoId)
    if (!s) return
    try {
      await ptyKill(s.sessionId)
    } catch {
      // 忽略：会话可能已退出
    }
    sessions.value.delete(repoId)
    sessions.value = new Map(sessions.value)
  }

  return {
    // state
    config,
    configFilePath,
    configLoading,
    configError,
    selectedRepoId,
    sessions,
    // getters
    groups,
    repositories,
    templates,
    reposByGroup,
    selectedRepo,
    // actions
    chooseAndLoadConfig,
    loadAndApplyConfig,
    autoLoadLastConfig,
    selectRepo,
    ensureSession,
    closeSession,
  }
})
