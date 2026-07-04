<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import ChecklistView from './ChecklistView.vue'
import { useChecklistStore } from '../stores/checklist'

// 应用启动时自动恢复上次的文件夹和清单文件
useChecklistStore().autoLoadLastState()
</script>

<template>
  <div class="checklist-tool">
    <Sidebar />
    <ChecklistView />
  </div>
</template>

<style scoped>
.checklist-tool {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}
</style>
