// Code Review 工具数据模型

/** 评审工具配置文件结构 */
export interface ReviewConfig {
  version: number
  /** 日志目录（默认配置文件同目录 logs/ 子目录） */
  logDir?: string
  /** 平台配置（全局共享） */
  platform: ReviewPlatform
  /** 评审脚本路径（统一一个脚本，参数通过环境变量注入） */
  script: string
  /** 项目列表 */
  projects: ReviewProject[]
}

/** 平台配置 */
export interface ReviewPlatform {
  /** 平台地址，如 https://devops.tone.tcl.com */
  url: string
  /** 访问令牌 */
  accessToken: string
}

/** 评审项目定义 */
export interface ReviewProject {
  id: string
  /** 显示名称 */
  name: string
  /** 本地仓库路径（用于拉取分支列表、作为脚本工作目录） */
  repoPath: string
  /** 仓库 ID（API 接口路径参数） */
  repoId: string
  /** 项目全名，如 rd-plm/plm-pdm-service */
  fullName: string
  /** 默认目标分支 */
  defaultDestBranch: string
  /** 默认源分支（可选，配置后跳过分支列表加载，避免卡顿） */
  defaultSrcBranch?: string
}

/** 评审执行参数（运行时由表单收集） */
export interface ReviewParams {
  projectId: string
  srcBranch: string
  destBranch: string
  /** 评审标题（可选，空则脚本自动生成） */
  subject?: string
}

/** 脚本执行结果（与 Rust ScriptRunResult 对应） */
export interface ReviewRunResult {
  success: boolean
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

/** 日志条目（与 Rust ScriptLogEntry 对应） */
export interface ReviewLogEntry {
  file_name: string
  task_id: string
  timestamp: string
  size: number
}

/** 仓库状态（与 Rust ReviewRepoStatus 对应） */
export interface ReviewRepoStatus {
  /** 当前分支（DETACHED 时为空） */
  current_branch: string
  /** 上游分支名（无上游时为空） */
  upstream: string
  /** 最近 5 个本地分支（按提交时间倒序） */
  recent_local: string[]
}

/** 源分支最新提交信息（与 Rust ReviewLatestCommit 对应） */
export interface ReviewLatestCommit {
  /** 短 hash */
  hash: string
  /** commit 标题 */
  subject: string
}
