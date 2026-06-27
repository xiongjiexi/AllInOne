<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import ChecklistView from './ChecklistView.vue'
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
