<script setup lang="ts">
import Toolbar from './components/Toolbar.vue'
import { useToolStore } from './stores/tool'
import ChecklistTool from './features/checklist/components/ChecklistTool.vue'
import GitFastTool from './features/gitfast/components/GitFastTool.vue'
import ScriptTool from './features/scripts/components/ScriptTool.vue'
import ReviewTool from './features/review/components/ReviewTool.vue'
import TextUtilsTool from './features/textutils/components/TextUtilsTool.vue'
import NotesTool from './features/notes/components/NotesTool.vue'

const tool = useToolStore()
</script>

<template>
  <div class="app-shell">
    <Toolbar />
    <div class="app-body">
      <!-- 用 v-show 而非 v-if，保留各工具状态（清单文件、GitFast 终端、笔记内容） -->
      <ChecklistTool v-show="tool.current === 'checklist'" />
      <GitFastTool v-show="tool.current === 'gitfast'" />
      <ScriptTool v-show="tool.current === 'scripts'" />
      <ReviewTool v-show="tool.current === 'review'" />
      <NotesTool v-show="tool.current === 'notes'" />
      <TextUtilsTool v-show="tool.current === 'textutils'" />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
