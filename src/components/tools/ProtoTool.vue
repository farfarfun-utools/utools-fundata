<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { computeDiff } from '../../lib/diff'
import { renumberProto } from '../../lib/proto'
import { SAMPLES, type FunDataSettings } from '../../lib/storage'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{
  settings: FunDataSettings
}>()

const emit = defineEmits<{
  copy: [text: string]
  export: [payload: { filename: string; content: string }]
  metrics: [summary: string]
}>()

const isEn = computed(() => props.settings.locale === 'en')
const protoInput = ref<string>(SAMPLES.protobuf)
const previewMode = ref<'split' | 'diff'>('split')

const result = computed(() => renumberProto(protoInput.value))
const diffResult = computed(() => computeDiff(protoInput.value, result.value.output))

watch(
  result,
  (res) => {
    emit(
      'metrics',
      isEn.value
        ? `${res.changes} field tag(s) updated`
        : `已重排 ${res.changes} 处字段编号`,
    )
  },
  { immediate: true },
)

function applyToSource() {
  protoInput.value = result.value.output
}

function loadSample() {
  protoInput.value = SAMPLES.protobuf
}

function applyInput(text: string) {
  protoInput.value = text
}

function getExportPayload() {
  return {
    filename: 'renumbered.proto',
    content: result.value.output,
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-proto">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: previewMode === 'split' }"
            @click="previewMode = 'split'"
          >
            {{ isEn ? 'Editor + Output' : '输入与结果' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="proto-diff-tab"
            :class="{ active: previewMode === 'diff' }"
            @click="previewMode = 'diff'"
          >
            {{ isEn ? 'Side-by-Side Diff' : '并排 Diff 预览' }}
          </button>
        </div>

        <span
          class="badge"
          :class="result.changes > 0 ? 'badge-accent' : 'badge-success'"
          data-testid="proto-changes-badge"
        >
          {{
            result.changes > 0
              ? isEn
                ? `${result.changes} tags updated`
                : `更新 ${result.changes} 处编号`
              : isEn
                ? 'Already sequential'
                : '编号已规范'
          }}
        </span>
      </div>

      <div class="tool-toolbar-group">
        <button
          type="button"
          class="pill-btn xs soft"
          :disabled="result.changes === 0"
          @click="applyToSource"
        >
          {{ isEn ? 'Apply to Left' : '覆写到左侧' }}
        </button>
        <button type="button" class="pill-btn xs" @click="emit('copy', result.output)">
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy' : '复制' }}
        </button>
        <button type="button" class="pill-btn xs" @click="emit('export', getExportPayload())">
          <AppIcon name="download" :size="12" />
          {{ isEn ? 'Export .proto' : '导出 .proto' }}
        </button>
      </div>
    </div>

    <div v-if="previewMode === 'split'" class="tool-split">
      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">{{ isEn ? 'Original .proto' : '原始 .proto 定义' }}</span>
          <button type="button" class="ghost-btn xs" @click="protoInput = ''">
            {{ isEn ? 'Clear' : '清空' }}
          </button>
        </div>
        <textarea
          v-model="protoInput"
          class="code-textarea"
          data-testid="proto-input"
          spellcheck="false"
        />
      </div>

      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">
            {{ isEn ? 'Renumbered Output' : '重编号结果' }}
            <span class="badge badge-neutral">skip reserved &amp; 19000..19999</span>
          </span>
        </div>
        <textarea
          :value="result.output"
          class="code-textarea"
          data-testid="proto-output"
          readonly
          spellcheck="false"
        />
      </div>
    </div>

    <div v-else class="diff-table-wrap" data-testid="proto-diff-view">
      <table class="diff-table">
        <tbody>
          <tr
            v-for="(row, idx) in diffResult.rows"
            :key="idx"
            :class="`diff-${row.kind}`"
          >
            <td class="ln">{{ row.leftLine ?? '' }}</td>
            <td class="left-cell">{{ row.leftText }}</td>
            <td class="ln">{{ row.rightLine ?? '' }}</td>
            <td class="right-cell">{{ row.rightText }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
