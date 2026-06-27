// 主题状态：深/浅切换，持久化到 localStorage

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'allinone-theme'

function detectInitial(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  if (saved === 'light' || saved === 'dark') return saved
  // 跟随系统
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(detectInitial())

  function applyTheme(m: ThemeMode) {
    document.documentElement.setAttribute('data-theme', m)
  }

  function toggle() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  watch(mode, (m) => {
    localStorage.setItem(STORAGE_KEY, m)
    applyTheme(m)
  }, { immediate: true })

  return { mode, toggle }
})
