// GitFast 配置与运行时数据模型

/** 模板参数来源 */
export type ParamSource = 'branch-list' | 'today' | 'prompt' | 'none'

/** 模板参数定义 */
export interface TemplateParam {
  key: string
  source: ParamSource
}

/** 命令模板：由一串命令组合而成的"动作流" */
export interface CommandTemplate {
  id: string
  name: string
  commands: string[]
  description?: string
  params?: TemplateParam[]
}

/** 仓库分组 */
export interface RepoGroup {
  id: string
  name: string
}

/** 仓库条目 */
export interface Repository {
  id: string
  name: string
  path: string
  groupId?: string
}

/** 全局设置 */
export interface GitFastSettings {
  maxParallel: number
  shell: 'bash'
}

/** 完整配置文件结构 */
export interface GitFastConfig {
  version: number
  settings: GitFastSettings
  groups: RepoGroup[]
  repositories: Repository[]
  templates: CommandTemplate[]
}

/** 仓库运行时状态（P1 才填充） */
export interface RepoRuntimeStatus {
  branch: string
  changes: number
  ahead: number
  behind: number
}
