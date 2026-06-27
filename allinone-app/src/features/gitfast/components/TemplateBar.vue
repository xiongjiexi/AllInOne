<script setup lang="ts">
import { ref } from 'vue'
import { useGitFastStore } from '../stores/gitfast'
import { ptyWrite } from '../lib/backend'
import { gitBranchList } from '../lib/backend'
import { renderTemplate, fillAutoParams, templateNeedsUserInput } from '../lib/template'
import type { CommandTemplate } from '../types'

const props = defineProps<{
  sessionId: number | null
  repoPath: string
}>()

const store = useGitFastStore()

// 正在执行的模板 id（用于禁用按钮）
const runningId = ref<string>('')
// 弹窗状态
const paramDialog = ref<{
  visible: boolean
  template: CommandTemplate | null
  branches: string[]
  selectedBranch: string
  promptValue: string
}>({
  visible: false,
  template: null,
  branches: [],
  selectedBranch: '',
  promptValue: '',
})

async function onClickTemplate(t: CommandTemplate) {
  if (!props.sessionId) {
    alert('请先选择一个仓库')
    return
  }
  if (runningId.value) return

  // 需要用户输入参数的模板：先弹框收集
  if (templateNeedsUserInput(t)) {
    await openParamDialog(t)
    return
  }

  // 不需要用户输入：直接执行（自动填充 today 参数）
  await runTemplate(t, fillAutoParams(t))
}

async function openParamDialog(t: CommandTemplate) {
  paramDialog.value.template = t
  paramDialog.value.selectedBranch = ''
  paramDialog.value.promptValue = ''
  paramDialog.value.branches = []
  paramDialog.value.visible = true

  // 如果有 branch-list 类型参数，预加载分支列表
  const needBranch = (t.params ?? []).some(p => p.source === 'branch-list')
  if (needBranch) {
    try {
      paramDialog.value.branches = await gitBranchList(props.repoPath)
      // 默认选当前分支（带 * 标记的会在 backend 过滤掉，这里取第一个）
      if (paramDialog.value.branches.length > 0) {
        paramDialog.value.selectedBranch = paramDialog.value.branches[0]
      }
    } catch (e: any) {
      alert(`获取分支列表失败: ${e?.message ?? e}`)
      paramDialog.value.visible = false
    }
  }
}

function cancelParamDialog() {
  paramDialog.value.visible = false
  paramDialog.value.template = null
}

async function confirmParamDialog() {
  const t = paramDialog.value.template
  if (!t) return
  const values: Record<string, string> = { ...fillAutoParams(t) }
  for (const p of t.params ?? []) {
    if (p.source === 'branch-list') {
      values[p.key] = paramDialog.value.selectedBranch
    } else if (p.source === 'prompt') {
      values[p.key] = paramDialog.value.promptValue
    }
  }
  paramDialog.value.visible = false
  paramDialog.value.template = null
  await runTemplate(t, values)
}

async function runTemplate(t: CommandTemplate, params: Record<string, string>) {
  if (!props.sessionId) return
  runningId.value = t.id
  try {
    const cmd = renderTemplate(t, params)
    // 在终端写入整条命令 + 换行（让 bash 执行）
    await ptyWrite(props.sessionId, cmd + '\n')
  } catch (e: any) {
    console.error('[runTemplate]', e)
    alert(`执行失败: ${e?.message ?? e}`)
  } finally {
    // 短暂禁用后恢复（防止用户连点）
    setTimeout(() => { runningId.value = '' }, 300)
  }
}
</script>

<template>
  <div class="template-bar">
    <span class="bar-label">模板：</span>
    <div class="template-buttons">
      <button
        v-for="t in store.templates"
        :key="t.id"
        class="btn btn-sm template-btn"
        :disabled="!props.sessionId || !!runningId"
        :title="t.description ?? t.name"
        @click="onClickTemplate(t)"
      >
        {{ t.name }}
      </button>
    </div>

    <!-- 参数弹窗 -->
    <div v-if="paramDialog.visible" class="dialog-mask" @click.self="cancelParamDialog">
      <div class="dialog">
        <div class="dialog-title">{{ paramDialog.template?.name }} - 参数</div>
        <div class="dialog-body">
          <template v-if="paramDialog.template">
            <div
              v-for="p in paramDialog.template.params ?? []"
              :key="p.key"
              class="param-row"
            >
              <label class="param-label">{{ p.key }}</label>
              <select
                v-if="p.source === 'branch-list'"
                v-model="paramDialog.selectedBranch"
                class="param-input"
              >
                <option v-for="b in paramDialog.branches" :key="b" :value="b">{{ b }}</option>
              </select>
              <input
                v-else-if="p.source === 'prompt'"
                v-model="paramDialog.promptValue"
                class="param-input"
                :placeholder="`请输入 ${p.key}`"
              />
              <input
                v-else
                :value="p.source"
                class="param-input"
                disabled
              />
            </div>
          </template>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-sm" @click="cancelParamDialog">取消</button>
          <button class="btn btn-sm btn-primary" @click="confirmParamDialog">执行</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-sidebar);
  flex-wrap: wrap;
}
.bar-label {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.template-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.template-btn {
  min-width: 0;
}
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 360px;
  max-width: 90vw;
  box-shadow: var(--shadow);
}
.dialog-title {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}
.dialog-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.param-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.param-label {
  font-size: 12px;
  color: var(--text-soft);
}
.param-input {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.param-input:focus {
  border-color: var(--accent);
}
.dialog-actions {
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
