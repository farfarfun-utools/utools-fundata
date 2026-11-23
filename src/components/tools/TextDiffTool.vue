<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { computeDiff } from '../../lib/diff'
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

const leftText = ref<string>(SAMPLES.diffLeft)
const rightText = ref<string>(SAMPLES.diffRight)
const ignoreWhitespace = ref(false)

const diffResult = computed(() =>
  computeDiff(leftText.value, rightText.value, { ignoreWhitespace: ignoreWhitespace.value }),
)

function swapDiffSides() {
  const tmp = leftText.value
  leftText.value = rightText.value
  rightText.value = tmp
}

watch(
  diffResult,
  (res) => {
    const s = res.stats
    emit('metrics', `+${s.added}  -${s.removed}  ~${s.modified}`)
  },
  { immediate: true },
)

function loadSample() {
  leftText.value = SAMPLES.diffLeft
  rightText.value = SAMPLES.diffRight
}

function applyInput(text: string) {
  leftText.value = text
}

function getExportPayload() {
  return { filename: 'diff-unified.patch', content: diffResult.value.unified }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-diff">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <span class="badge badge-success">+{{ diffResult.stats.added }}</span>
        <span class="badge badge-danger">-{{ diffResult.stats.removed }}</span>
        <span class="badge badge-warning">~{{ diffResult.stats.modified }}</span>
        <label class="ws-toggle">
          <input v-model="ignoreWhitespace" type="checkbox" />
          <span>{{ isEn ? 'Ignore whitespace' : '忽略空白' }}</span>
        </label>
      </div>

      <div class="tool-toolbar-group">
        <button type="button" class="pill-btn xs" @click="swapDiffSides">
          <AppIcon name="arrows-left-right" :size="12" />
          {{ isEn ? 'Swap' : '左右互换' }}
        </button>
        <button type="button" class="pill-btn xs soft" @click="emit('copy', diffResult.unified)">
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy Patch' : '复制差异' }}
        </button>
      </div>
    </div>

    <div class="diff-workspace">
      <div class="diff-editors-row">
        <div class="tool-pane">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Original (Left)' : '原文（左侧）' }}</span>
            <button type="button" class="ghost-btn xs" @click="leftText = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
          <textarea v-model="leftText" class="code-textarea" spellcheck="false" />
        </div>
        <div class="tool-pane">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Modified (Right)' : '修改后（右侧）' }}</span>
            <button type="button" class="ghost-btn xs" @click="rightText = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
          <textarea v-model="rightText" class="code-textarea" spellcheck="false" />
        </div>
      </div>

      <div class="diff-table-wrap diff-preview-pane" data-testid="text-diff-table">
        <table class="diff-table">
          <tbody>
            <tr v-for="(row, idx) in diffResult.rows" :key="idx" :class="`diff-${row.kind}`">
              <td class="ln">{{ row.leftLine ?? '' }}</td>
              <td class="left-cell">{{ row.leftText }}</td>
              <td class="ln">{{ row.rightLine ?? '' }}</td>
              <td class="right-cell">{{ row.rightText }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ws-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.diff-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 170px minmax(0, 1fr);
  gap: 1px;
  background: var(--border);
  overflow: hidden;
}

.diff-editors-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--border);
  min-height: 0;
  overflow: hidden;
}

.diff-preview-pane {
  min-height: 0;
}

@media (max-width: 640px) {
  .diff-editors-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
