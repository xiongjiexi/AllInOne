// Code Review 默认配置

import type { ReviewConfig } from '../types'

export const DEFAULT_CONFIG: ReviewConfig = {
  version: 1,
  logDir: '',
  platform: {
    url: '',
    accessToken: '',
  },
  script: '',
  projects: [],
}
