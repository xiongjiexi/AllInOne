<script setup lang="ts">
import NotesSidebar from './NotesSidebar.vue'
import NotesView from './NotesView.vue'
import { useNotesStore } from '../stores/notes'

// 应用启动时自动恢复上次的文件夹和笔记
useNotesStore().autoLoadLastState()
</script>

<template>
  <div class="notes-tool">
    <NotesSidebar />
    <NotesView />
  </div>
</template>

<style scoped>
.notes-tool {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}
</style>
