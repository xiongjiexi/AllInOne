// GitFast 配置与运行时数据模型

/** 模板参数来源 */
export type ParamSource = 'branch-list' | 'today' | 'prompt' | 'none'

/** 模板参数定义 */
export interface TemplateParam {
  key: string
  source: ParamSource
}

/** 参数处理器上下文：提供处理器运行所需的环境信息 */
export interface ParamHandlerContext {
  /** 当前仓库路径（用于获取分支列表等） */
  repoPath: string
  /** 用户在弹窗中输入的值（key → value） */
  userInput?: Record<string, string>
}

/** 参数处理器：封装某种参数来源的判断与取值逻辑 */
export interface ParamHandler {
  /** 对应的参数来源类型 */
  source: ParamSource
  /** 是否需要用户输入（true 则弹框收集） */
  needsUserInput: boolean
  /** 获取该参数的最终值 */
  getValue(context: ParamHandlerContext, paramKey: string): string
  /** 预加载选项数据（需要用户选择的参数实现此方法） */
  loadOptions?(context: ParamHandlerContext): Promise<string[]>
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
