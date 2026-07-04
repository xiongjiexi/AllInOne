// Script Runner 状态管理

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ScriptRunnerConfig, ScriptTask, ScriptRunResult, ScriptLogEntry } from '../types'
import { DEFAULT_CONFIG } from '../lib/defaultConfig'
import { loadConfigFile, pickConfigFile } from '../lib/configLoader'
import { runScript, listLogs, readLog, deleteLog } from '../lib/backend'

const CONFIG_PATH_KEY = 'allinone-scripts-config-path'

/** 任务运行时状态（内存，不持久化） */
interface TaskRuntime {
  /** 是否正在执行 */
  running: boolean
  /** 上次执行结果 */
  lastResult: ScriptRunResult | null
  /** 上次执行时间 */
  lastRunAt: number | null
  /** 运行时 enabled 覆盖（null=用配置文件的 enabled） */
  runtimeEnabled: boolean | null
}

export const useScriptsStore = defineStore('scripts', () => {
  const config = ref<ScriptRunnerConfig>({ ...DEFAULT_CONFIG })
  const configPath = ref<string>('')
  const loaded = ref(false)
  const error = ref<string>('')

  // 任务运行时状态
  const runtimes = ref<Map<string, TaskRuntime>>(new Map())

  // 定时器
  const timers = new Map<string, ReturnType<typeof setInterval>>()
  // 正在执行的任务集合（防重叠）
  const runningTaskIds = new Set<string>()

  // ============ 计算属性 ============

  const tasks = computed(() => config.value.tasks)
  const logDir = computed(() => config.value.logDir ?? '')

  function getRuntime(taskId: string): TaskRuntime {
    if (!runtimes.value.has(taskId)) {
      runtimes.value.set(taskId, {
        running: false,
        lastResult: null,
        lastRunAt: null,
        runtimeEnabled: null,
      })
    }
    return runtimes.value.get(taskId)!
  }

  /** 获取任务生效的 enabled 状态（运行时覆盖优先） */
  function isTaskEnabled(task: ScriptTask): boolean {
    const rt = getRuntime(task.id)
    return rt.runtimeEnabled ?? task.enabled
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
      // 启动所有启用的任务
      startAllSchedulers()
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      loaded.value = false
    }
  }

  /** 弹对话框选配置文件并加载 */
  async function pickAndLoadConfig() {
    const p = await pickConfigFile()
    if (!p) return
    await loadConfig(p)
  }

  /** 应用启动时从 localStorage 恢复路径并自动加载 */
  async function autoLoadOnStartup() {
    const p = localStorage.getItem(CONFIG_PATH_KEY)
    if (p) {
      await loadConfig(p)
    }
  }

  // ============ 任务执行 ============

  async function executeTask(task: ScriptTask, trigger: 'manual' | 'schedule') {
    const rt = getRuntime(task.id)
    if (rt.running) return // 防重叠

    rt.running = true
    runningTaskIds.add(task.id)
    try {
      const result = await runScript({
        script: task.script,
        workdir: task.workdir ?? '',
        timeoutSecs: task.timeout ?? 0,
        logDir: logDir.value,
        taskId: task.id,
        taskName: task.name,
        trigger,
      })
      rt.lastResult = result
      rt.lastRunAt = Date.now()
    } catch (e: any) {
      rt.lastResult = {
        success: false,
        exit_code: -1,
        duration_ms: 0,
        stdout: '',
        stderr: e?.message ?? String(e),
      }
      rt.lastRunAt = Date.now()
    } finally {
      rt.running = false
      runningTaskIds.delete(task.id)
    }
  }

  /** 立即执行一次（不受 enabled 限制） */
  async function runOnce(task: ScriptTask) {
    await executeTask(task, 'manual')
  }

  /** 启停（仅改内存运行时，不落盘） */
  function toggleEnabled(task: ScriptTask) {
    const rt = getRuntime(task.id)
    const current = isTaskEnabled(task)
    rt.runtimeEnabled = !current
    // 重启定时器
    if (rt.runtimeEnabled) {
      startScheduler(task)
    } else {
      stopScheduler(task.id)
    }
  }

  // ============ 定时器 ============

  function startScheduler(task: ScriptTask) {
    stopScheduler(task.id)
    if (!isTaskEnabled(task)) return

    if (task.rule.type === 'interval') {
      const ms = (task.rule.minutes ?? 30) * 60 * 1000
      const handle = setInterval(() => {
        executeTask(task, 'schedule').catch(e => console.error('[script-scheduler]', task.id, e))
      }, ms)
      timers.set(task.id, handle)
    } else {
      // daily：每分钟检查一次
      const handle = setInterval(() => {
        const now = new Date()
        const [h, m] = (task.rule.time ?? '09:00').split(':').map(n => parseInt(n, 10) || 0)
        if (now.getHours() === h && now.getMinutes() === m) {
          executeTask(task, 'schedule').catch(e => console.error('[script-scheduler]', task.id, e))
        }
      }, 60 * 1000)
      timers.set(task.id, handle)
    }
  }

  function stopScheduler(taskId: string) {
    const h = timers.get(taskId)
    if (h) {
      clearInterval(h)
      timers.delete(taskId)
    }
  }

  function startAllSchedulers() {
    // 清空旧的
    for (const h of timers.values()) clearInterval(h)
    timers.clear()
    // 启动所有启用的任务
    for (const t of config.value.tasks) {
      startScheduler(t)
    }
  }

  function stopAllSchedulers() {
    for (const h of timers.values()) clearInterval(h)
    timers.clear()
  }

  // ============ 日志 ============

  async function fetchLogs(taskId: string): Promise<ScriptLogEntry[]> {
    if (!logDir.value) return []
    return await listLogs(logDir.value, taskId)
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
    tasks,
    logDir,
    runtimes,
    // 计算辅助
    isTaskEnabled,
    getRuntime,
    // 配置
    loadConfig,
    pickAndLoadConfig,
    autoLoadOnStartup,
    // 执行
    runOnce,
    toggleEnabled,
    // 日志
    fetchLogs,
    fetchLogContent,
    removeLog,
    // 生命周期
    startAllSchedulers,
    stopAllSchedulers,
  }
})
