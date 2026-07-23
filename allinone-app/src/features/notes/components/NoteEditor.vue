<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { useNotesStore } from '../stores/notes'
import { useThemeStore } from '@/stores/theme'

const store = useNotesStore()
const theme = useThemeStore()

const editorHost = ref<HTMLDivElement | null>(null)
// 用 shallowRef 避免 Vue 对 EditorView 做深度响应式（性能 + 正确性）
const view = shallowRef<EditorView | null>(null)
const themeCompartment = new Compartment()

// ===== 工具栏：插入式操作 =====

/** 包裹选区（如 **selection**） */
function wrapSelection(before: string, after: string = before): void {
  const v = view.value
  if (!v) return
  const sel = v.state.selection.main
  const selected = v.state.doc.sliceString(sel.from, sel.to)
  v.dispatch({
    changes: { from: sel.from, to: sel.to, insert: before + selected + after },
    selection: { anchor: sel.from + before.length, head: sel.from + before.length + selected.length },
  })
  v.focus()
}

/** 行首插入前缀（如 # / - / >） */
function prefixLines(prefix: string): void {
  const v = view.value
  if (!v) return
  const sel = v.state.selection.main
  const from = sel.from, to = sel.to
  const text = v.state.doc.sliceString(from, to)
  const lines = text.split('\n')
  const newText = lines.map(l => prefix + l).join('\n')
  v.dispatch({
    changes: { from, to, insert: newText },
  })
  v.focus()
}

/** 插入代码块包裹选区 */
function wrapCodeBlock(): void {
  const v = view.value
  if (!v) return
  const sel = v.state.selection.main
  const selected = v.state.doc.sliceString(sel.from, sel.to) || 'code'
  const insert = '```\n' + selected + '\n```\n'
  v.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
  })
  v.focus()
}

function onBold() { wrapSelection('**') }
function onItalic() { wrapSelection('*') }
function onH1() { prefixLines('# ') }
function onH2() { prefixLines('## ') }
function onH3() { prefixLines('### ') }
function onQuote() { prefixLines('> ') }
function onList() { prefixLines('- ') }
function onLink() {
  const v = view.value
  if (!v) return
  const sel = v.state.selection.main
  const selected = v.state.doc.sliceString(sel.from, sel.to) || '链接文字'
  const insert = `[${selected}](url)`
  v.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
  })
  v.focus()
}
function onCode() { wrapCodeBlock() }

// ===== 编辑器初始化 =====

function buildExtensions(): any[] {
  return [
    basicSetup,
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          store.persist()
          return true
        },
      },
      {
        key: 'Mod-e',
        run: () => {
          store.switchMode('read')
          return true
        },
      },
    ]),
    // 内容变化监听：同步到 store（不立即保存）
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        store.setCurrentContent(update.state.doc.toString())
      }
    }),
    themeCompartment.of(theme.mode === 'dark' ? oneDark : []),
  ]
}

function initEditor(): void {
  if (!editorHost.value) return
  // 销毁旧实例（切换文件时）
  view.value?.destroy()
  const state = EditorState.create({
    doc: store.currentContent,
    extensions: buildExtensions(),
  })
  view.value = new EditorView({
    state,
    parent: editorHost.value,
  })
}

// 主题变化时动态切换编辑器主题（无需重建实例）
watch(() => theme.mode, (m) => {
  view.value?.dispatch({
    effects: themeCompartment.reconfigure(m === 'dark' ? oneDark : []),
  })
})

onMounted(() => {
  initEditor()
})

// 当前文件变化时重建编辑器（加载新内容）
watch(() => store.currentFilePath, () => {
  if (store.mode === 'edit') {
    initEditor()
  }
})

onBeforeUnmount(() => {
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="note-editor">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <button class="tool-btn" title="加粗 (Ctrl+B)" @click="onBold"><b>B</b></button>
      <button class="tool-btn" title="斜体" @click="onItalic"><i>I</i></button>
      <span class="sep"></span>
      <button class="tool-btn" title="一级标题" @click="onH1">H1</button>
      <button class="tool-btn" title="二级标题" @click="onH2">H2</button>
      <button class="tool-btn" title="三级标题" @click="onH3">H3</button>
      <span class="sep"></span>
      <button class="tool-btn" title="引用" @click="onQuote">❝</button>
      <button class="tool-btn" title="列表" @click="onList">•</button>
      <button class="tool-btn" title="链接" @click="onLink">🔗</button>
      <button class="tool-btn" title="代码块" @click="onCode">&lt;/&gt;</button>
      <span class="sep"></span>
      <button class="tool-btn save-btn" title="保存 (Ctrl+S)" @click="store.persist()">
        💾 保存
      </button>
    </div>
    <!-- CodeMirror 挂载点 -->
    <div ref="editorHost" class="editor-host"></div>
  </div>
</template>

<style scoped>
.note-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  flex-wrap: wrap;
}
.tool-btn {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-soft);
  font-size: 13px;
  border-radius: var(--radius-sm);
  transition: all 0.1s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tool-btn:hover {
  background: var(--bg-soft);
  color: var(--text);
  border-color: var(--border);
}
.tool-btn.save-btn {
  margin-left: auto;
  color: var(--accent);
}
.sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
}

.editor-host {
  flex: 1;
  overflow: hidden;
  background: var(--bg);
}
.editor-host :deep(.cm-editor) {
  height: 100%;
  font-size: 14px;
}
.editor-host :deep(.cm-scroller) {
  font-family: 'Consolas', 'Monaco', 'PingFang SC', 'Microsoft YaHei', monospace;
  line-height: 1.7;
}
.editor-host :deep(.cm-content) {
  padding: 16px 0;
  max-width: 900px;
  margin: 0 auto;
}
.editor-host :deep(.cm-line) {
  padding: 0 24px;
}
</style>
