<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { computeDiff } from '../../lib/diff'
import { SAMPLES, type FunDataSettings } from '../../lib/storage'
import { computeTextStats, transformText, type TextBatchOp } from '../../lib/text-tools'
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
const activeTab = ref<'diff' | 'batch'>('diff')

// 1. Diff state
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

// 2. Batch state
const batchText = ref<string>(SAMPLES.batchText)
const prefixText = ref('')
const suffixText = ref('')

const textStats = computed(() => computeTextStats(batchText.value))

function applyBatchOp(op: TextBatchOp) {
  batchText.value = transformText(batchText.value, op, {
    prefix: prefixText.value,
    suffix: suffixText.value,
  })
}

watch(
  [activeTab, diffResult, textStats],
  () => {
    if (activeTab.value === 'diff') {
      const s = diffResult.value.stats
      emit('metrics', `+${s.added}  -${s.removed}  ~${s.modified}`)
    } else {
      const st = textStats.value
      emit(
        'metrics',
        `${st.lines} ${isEn.value ? 'lines' : '行'} · ${st.words} ${isEn.value ? 'words' : '词'} · ${st.bytes} B`,
      )
    }
  },
  { immediate: true },
)

function loadSample() {
  if (activeTab.value === 'diff') {
    leftText.value = SAMPLES.diffLeft
    rightText.value = SAMPLES.diffRight
  } else {
    batchText.value = SAMPLES.batchText
  }
}

function applyInput(text: string) {
  if (activeTab.value === 'diff') {
    leftText.value = text
  } else {
    batchText.value = text
  }
}

function getExportPayload() {
  if (activeTab.value === 'diff') {
    return { filename: 'diff-unified.patch', content: diffResult.value.unified }
  }
  return { filename: 'processed-text.txt', content: batchText.value }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-text">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: activeTab === 'diff' }"
            @click="activeTab = 'diff'"
          >
            {{ isEn ? 'Text Diff' : '文本对比' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="text-batch-tab"
            :class="{ active: activeTab === 'batch' }"
            @click="activeTab = 'batch'"
          >
            {{ isEn ? 'Batch Transform' : '文本批处理' }}
          </button>
        </div>

        <template v-if="activeTab === 'diff'">
          <span class="badge badge-success">+{{ diffResult.stats.added }}</span>
          <span class="badge badge-danger">-{{ diffResult.stats.removed }}</span>
          <span class="badge badge-warning">~{{ diffResult.stats.modified }}</span>
          <label class="ws-toggle">
            <input v-model="ignoreWhitespace" type="checkbox" />
            <span>{{ isEn ? 'Ignore whitespace' : '忽略空白' }}</span>
          </label>
        </template>
      </div>

      <div v-if="activeTab === 'diff'" class="tool-toolbar-group">
        <button type="button" class="pill-btn xs" @click="swapDiffSides">
          <AppIcon name="arrows-left-right" :size="12" />
          {{ isEn ? 'Swap' : '左右互换' }}
        </button>
        <button
          type="button"
          class="pill-btn xs soft"
          @click="emit('copy', diffResult.unified)"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy Patch' : '复制差异' }}
        </button>
      </div>

      <div v-else class="tool-toolbar-group">
        <button type="button" class="pill-btn xs soft" @click="emit('copy', batchText)">
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy Text' : '复制文本' }}
        </button>
      </div>
    </div>

    <!-- Diff Mode -->
    <div v-if="activeTab === 'diff'" class="diff-workspace">
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

    <!-- Batch Mode -->
    <div v-else class="batch-workspace" data-testid="text-batch-panel">
      <div class="batch-actions-bar">
        <button type="button" class="chip-btn" data-testid="batch-dedupe-btn" @click="applyBatchOp('dedupe')">
          {{ isEn ? 'Dedupe' : '去重' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('sort-asc')">
          {{ isEn ? 'Sort A→Z' : '升序 A→Z' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('sort-desc')">
          {{ isEn ? 'Sort Z→A' : '降序 Z→A' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('reverse')">
          {{ isEn ? 'Reverse' : '逆序' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('remove-empty')">
          {{ isEn ? 'Remove Empty' : '去空行' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('trim')">
          {{ isEn ? 'Trim Lines' : '首尾 Trim' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('upper')">UPPER</button>
        <button type="button" class="chip-btn" @click="applyBatchOp('lower')">lower</button>

        <div class="affix-inline">
          <input
            v-model="prefixText"
            type="text"
            class="field-input affix-input mono"
            :placeholder="isEn ? 'Prefix' : '前缀'"
          />
          <input
            v-model="suffixText"
            type="text"
            class="field-input affix-input mono"
            :placeholder="isEn ? 'Suffix' : '后缀'"
          />
          <button
            type="button"
            class="pill-btn xs soft"
            :disabled="!prefixText && !suffixText"
            @click="applyBatchOp('affix')"
          >
            {{ isEn ? 'Apply Affix' : '加前后缀' }}
          </button>
        </div>
      </div>

      <div class="batch-split">
        <div class="tool-pane">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Working Text' : '批处理文本' }}</span>
            <button type="button" class="ghost-btn xs" @click="batchText = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
          <textarea
            v-model="batchText"
            class="code-textarea"
            data-testid="batch-textarea"
            spellcheck="false"
          />
        </div>

        <div class="tool-pane batch-stats-pane">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Live Stats & Top 10 Lines' : '实时统计与 Top 10 行频' }}</span>
          </div>

          <div class="stats-grid">
            <div class="stat-pill">
              <span class="stat-k">{{ isEn ? 'Lines' : '总行数' }}</span>
              <strong class="tabular">{{ textStats.lines }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-k">{{ isEn ? 'Non-empty' : '非空行' }}</span>
              <strong class="tabular">{{ textStats.nonEmptyLines }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-k">{{ isEn ? 'Words' : '词数' }}</span>
              <strong class="tabular">{{ textStats.words }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-k">{{ isEn ? 'Chars' : '字符' }}</span>
              <strong class="tabular">{{ textStats.chars }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-k">{{ isEn ? 'Bytes' : '字节' }}</span>
              <strong class="tabular">{{ textStats.bytes }}</strong>
            </div>
          </div>

          <div class="freq-wrap">
            <table v-if="textStats.topLines.length > 0" class="freq-table">
              <thead>
                <tr>
                  <th>{{ isEn ? 'Line Content' : '行内容' }}</th>
                  <th class="col-cnt">{{ isEn ? 'Count' : '次数' }}</th>
                  <th class="col-pct">%</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in textStats.topLines" :key="idx">
                  <td class="mono freq-line">{{ item.line }}</td>
                  <td class="col-cnt tabular">{{ item.count }}</td>
                  <td class="col-pct tabular">{{ item.percent }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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

.batch-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.batch-actions-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-canvas);
  flex-shrink: 0;
}

.affix-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
}

.affix-input {
  width: 72px;
  height: 24px;
  font-size: 11.5px;
}

.batch-split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 1px;
  background: var(--border);
  overflow: hidden;
}

.batch-stats-pane {
  background: var(--bg-canvas);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  border: 1px solid var(--border);
}

.stat-k {
  font-size: 10px;
  color: var(--text-muted);
}

.stat-pill strong {
  font-size: 12.5px;
  color: var(--accent);
}

.freq-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.freq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.freq-table th {
  position: sticky;
  top: 0;
  text-align: left;
  padding: 6px 10px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
}

.freq-table td {
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
}

.freq-line {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-cnt,
.col-pct {
  width: 48px;
  text-align: right;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .diff-editors-row,
  .batch-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
