<script setup lang="ts">
import { computed } from 'vue'
import { useNotesStore } from '../stores/notes'
import { renderMarkdown } from '../lib/render'

const store = useNotesStore()

const html = computed(() => {
  if (!store.currentContent) return ''
  try {
    return renderMarkdown(store.currentContent)
  } catch (e) {
    console.error('[NoteReader] render failed', e)
    return '<p style="color:var(--danger)">渲染失败</p>'
  }
})

// 双击正文进入编辑模式
function onDblClick() {
  store.switchMode('edit')
}
</script>

<template>
  <div class="note-reader">
    <article
      class="note-content"
      v-html="html"
      @dblclick="onDblClick"
      title="双击进入编辑模式"
    ></article>
  </div>
</template>

<style scoped>
.note-reader {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 40px;
}

/* GitHub 风格 Markdown 渲染样式（使用 CSS 变量适配深浅主题） */
.note-content {
  max-width: 780px;
  margin: 0 auto;
  padding: 16px 32px;
  color: var(--text);
  line-height: 1.7;
  font-size: 15px;
  word-wrap: break-word;
}
.note-content :deep(h1) {
  font-size: 24px;
  font-weight: 600;
  margin: 24px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.note-content :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  margin: 22px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.note-content :deep(h3) {
  font-size: 17px;
  font-weight: 600;
  margin: 18px 0 8px;
}
.note-content :deep(h4),
.note-content :deep(h5),
.note-content :deep(h6) {
  font-size: 15px;
  font-weight: 600;
  margin: 14px 0 6px;
}
.note-content :deep(p) {
  margin: 10px 0;
}
.note-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
}
.note-content :deep(a:hover) {
  text-decoration: underline;
}
.note-content :deep(ul),
.note-content :deep(ol) {
  margin: 10px 0;
  padding-left: 28px;
}
.note-content :deep(li) {
  margin: 4px 0;
}
.note-content :deep(li > input[type="checkbox"]) {
  margin-right: 6px;
  vertical-align: middle;
}
.note-content :deep(code) {
  background: var(--bg-soft);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
  color: var(--text);
}
.note-content :deep(pre) {
  background: var(--bg-soft);
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid var(--border);
}
.note-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 13px;
  line-height: 1.6;
}
.note-content :deep(blockquote) {
  border-left: 3px solid var(--accent);
  margin: 12px 0;
  padding: 6px 16px;
  color: var(--text-soft);
  background: var(--bg-soft);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.note-content :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
}
.note-content :deep(th),
.note-content :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 12px;
  text-align: left;
}
.note-content :deep(th) {
  background: var(--bg-soft);
  font-weight: 600;
}
.note-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 20px 0;
}
.note-content :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-sm);
}
</style>
