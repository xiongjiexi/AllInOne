<script setup lang="ts">
import { ref } from 'vue'
import { useGitFastStore } from '../stores/gitfast'
import { ptyWrite } from '../lib/backend'
import { renderTemplate } from '../lib/template'
import { templateNeedsUserInput, fillTemplateParams, collectParamOptions } from '../lib/paramHandlers'
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
  // 每个参数的选项列表（如分支列表），key 为 param.key
  options: Record<string, string[]>
  // 每个参数的用户输入值，key 为 param.key
  values: Record<string, string>
}>({
  visible: false,
  template: null,
  options: {},
  values: {},
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

  // 不需要用户输入：直接执行（自动填充参数）
  const context = { repoPath: props.repoPath }
  await runTemplate(t, fillTemplateParams(t, context))
}

async function openParamDialog(t: CommandTemplate) {
  paramDialog.value.template = t
  paramDialog.value.options = {}
  paramDialog.value.values = {}
  paramDialog.value.visible = true

  // 通过处理器预加载需要选项的参数（如分支列表）
  try {
    const options = await collectParamOptions(t, { repoPath: props.repoPath })
    paramDialog.value.options = options
    // 对有选项的参数设置默认值（取第一项）
    for (const [key, list] of Object.entries(options)) {
      if (list.length > 0) {
        paramDialog.value.values[key] = list[0]
      }
    }
  } catch (e: any) {
    alert(`获取参数选项失败: ${e?.message ?? e}`)
    paramDialog.value.visible = false
  }
}

function cancelParamDialog() {
  paramDialog.value.visible = false
  paramDialog.value.template = null
}

async function confirmParamDialog() {
  const t = paramDialog.value.template
  if (!t) return
  const context = {
    repoPath: props.repoPath,
    userInput: { ...paramDialog.value.values },
  }
  paramDialog.value.visible = false
  paramDialog.value.template = null
  await runTemplate(t, fillTemplateParams(t, context))
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
                v-if="paramDialog.options[p.key]"
                v-model="paramDialog.values[p.key]"
                class="param-input"
              >
                <option v-for="opt in paramDialog.options[p.key]" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <input
                v-else
                v-model="paramDialog.values[p.key]"
                class="param-input"
                :placeholder="`请输入 ${p.key}`"
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
