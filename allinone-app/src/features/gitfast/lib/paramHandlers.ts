// 模板参数处理器：统一管理各参数来源的判断与取值逻辑
// 新增参数类型时，只需在此文件添加对应处理器并注册，无需修改 UI 组件

import type { CommandTemplate, ParamHandler, ParamHandlerContext, ParamSource } from '../types'
import type { ParamValues } from './template'
import { todayDateStr } from './template'
import { gitBranchList } from './backend'

/** today 类型处理器：自动填充当天日期，无需用户输入 */
const todayHandler: ParamHandler = {
  source: 'today',
  needsUserInput: false,
  getValue: () => todayDateStr(),
}

/** branch-list 类型处理器：需用户从分支列表选择 */
const branchListHandler: ParamHandler = {
  source: 'branch-list',
  needsUserInput: true,
  async loadOptions(context: ParamHandlerContext) {
    return await gitBranchList(context.repoPath)
  },
  getValue(context: ParamHandlerContext, paramKey: string) {
    return context.userInput?.[paramKey] ?? ''
  },
}

/** prompt 类型处理器：需用户手动输入 */
const promptHandler: ParamHandler = {
  source: 'prompt',
  needsUserInput: true,
  getValue(context: ParamHandlerContext, paramKey: string) {
    return context.userInput?.[paramKey] ?? ''
  },
}

/** none 类型处理器：无参数来源 */
const noneHandler: ParamHandler = {
  source: 'none',
  needsUserInput: false,
  getValue: () => '',
}

/** 处理器注册表：source → handler */
export const paramHandlers: Record<ParamSource, ParamHandler> = {
  today: todayHandler,
  'branch-list': branchListHandler,
  prompt: promptHandler,
  none: noneHandler,
}

/** 获取指定参数来源的处理器 */
export function getParamHandler(source: ParamSource): ParamHandler {
  return paramHandlers[source] ?? noneHandler
}

/** 模板是否需要用户输入参数 */
export function templateNeedsUserInput(template: CommandTemplate): boolean {
  return (template.params ?? []).some(p => getParamHandler(p.source).needsUserInput)
}

/**
 * 为模板填充全部参数值（自动参数 + 用户输入参数）
 * - 自动参数（如 today）直接取值
 * - 用户输入参数从 context.userInput 取值
 */
export function fillTemplateParams(
  template: CommandTemplate,
  context: ParamHandlerContext,
): ParamValues {
  const values: ParamValues = {}
  for (const p of template.params ?? []) {
    const handler = getParamHandler(p.source)
    values[p.key] = handler.getValue(context, p.key)
  }
  return values
}

/**
 * 预加载需要用户选择的参数选项（如分支列表）
 * @returns paramKey → 选项列表
 */
export async function collectParamOptions(
  template: CommandTemplate,
  context: ParamHandlerContext,
): Promise<Record<string, string[]>> {
  const options: Record<string, string[]> = {}
  for (const p of template.params ?? []) {
    const handler = getParamHandler(p.source)
    if (handler.loadOptions) {
      options[p.key] = await handler.loadOptions(context)
    }
  }
  return options
}
