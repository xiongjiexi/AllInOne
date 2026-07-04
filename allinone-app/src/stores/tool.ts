// 全局工具切换状态
// 管理当前激活的工具 tab，持久化到 localStorage

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ToolId = 'checklist' | 'gitfast' | 'scripts' | 'review' | 'textutils'

const STORAGE_KEY = 'allinone-active-tool'

function detectInitial(): ToolId {
  const saved = localStorage.getItem(STORAGE_KEY) as ToolId | null
  if (saved === 'checklist' || saved === 'gitfast' || saved === 'scripts' || saved === 'review' || saved === 'textutils') return saved
  return 'checklist'
}

export const useToolStore = defineStore('tool', () => {
  const current = ref<ToolId>(detectInitial())

  function set(tool: ToolId) {
    current.value = tool
  }

  watch(current, (t) => {
    localStorage.setItem(STORAGE_KEY, t)
  })

  return { current, set }
})
