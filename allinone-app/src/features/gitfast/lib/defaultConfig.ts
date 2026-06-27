// GitFast 默认配置
// 用户未加载任何配置文件时使用此默认值

import type { GitFastConfig } from '../types'

export const DEFAULT_CONFIG: GitFastConfig = {
  version: 1,
  settings: {
    maxParallel: 5,
    shell: 'bash',
  },
  groups: [
    { id: 'default', name: '默认' },
  ],
  repositories: [],
  templates: [
    {
      id: 'sync',
      name: '同步',
      commands: ['git pull', 'git push'],
      description: '拉取并推送',
    },
    {
      id: 'fetch',
      name: '获取',
      commands: ['git fetch --all --prune'],
      description: '拉取远程引用不合并',
    },
    {
      id: 'status',
      name: '状态',
      commands: ['git status'],
      description: '查看工作区状态',
    },
    {
      id: 'log',
      name: '日志',
      commands: ['git log --oneline -20'],
      description: '最近 20 条提交',
    },
    {
      id: 'branch-list',
      name: '分支列表',
      commands: ['git branch -a'],
      description: '列出本地+远程分支',
    },
    {
      id: 'branch-switch',
      name: '切换分支',
      commands: ['git checkout {branch}'],
      description: '切换到指定分支',
      params: [{ key: 'branch', source: 'branch-list' }],
    },
    {
      id: 'pull-branch',
      name: '拉取分支',
      commands: ['git pull origin {branch}'],
      description: '拉取指定远程分支',
      params: [{ key: 'branch', source: 'branch-list' }],
    },
    {
      id: 'rebase-branch',
      name: '变基分支',
      commands: ['git fetch origin {branch}', 'git rebase origin/{branch}'],
      description: '变基到指定远程分支',
      params: [{ key: 'branch', source: 'branch-list' }],
    },
    {
      id: 'stash',
      name: '暂存',
      commands: ['git stash'],
      description: '暂存当前改动',
    },
    {
      id: 'commit-checklist',
      name: '提交清单',
      commands: ['git add -A', 'git commit -m "sync checklist {date}"', 'git push'],
      description: '用默认消息提交并推送清单改动',
      params: [{ key: 'date', source: 'today' }],
    },
  ],
}
