// Script Runner 数据模型

/** 调度规则 */
export interface ScheduleRule {
  /** daily=每天定时 / interval=间隔 */
  type: 'daily' | 'interval'
  /** type=daily 时：执行时间 HH:MM */
  time?: string
  /** type=interval 时：间隔分钟数 */
  minutes?: number
}

/** 脚本任务定义 */
export interface ScriptTask {
  id: string
  name: string
  /** 脚本文件路径（.sh/.bash 用 bash 执行，.bat/.cmd 用 cmd 执行） */
  script: string
  /** 工作目录（可选，默认脚本所在目录） */
  workdir?: string
  rule: ScheduleRule
  enabled: boolean
  /** 单次执行超时秒数（0=不超时） */
  timeout?: number
}

/** 完整配置文件结构 */
export interface ScriptRunnerConfig {
  version: number
  /** 日志目录（默认配置文件同目录的 logs/ 子目录） */
  logDir?: string
  tasks: ScriptTask[]
}

/** 脚本执行结果（与 Rust ScriptRunResult 对应） */
export interface ScriptRunResult {
  success: boolean
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

/** 日志条目（与 Rust ScriptLogEntry 对应） */
export interface ScriptLogEntry {
  file_name: string
  task_id: string
  timestamp: string
  size: number
}
