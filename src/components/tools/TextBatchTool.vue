<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  [textStats, isEn],
  () => {
    const st = textStats.value
    emit(
      'metrics',
      `${st.lines} ${isEn.value ? 'lines' : '行'} · ${st.words} ${isEn.value ? 'words' : '词'} · ${st.bytes} B`,
    )
  },
  { immediate: true },
)

function loadSample() {
  batchText.value = SAMPLES.batchText
}

function applyInput(text: string) {
  batchText.value = text
}

function getExportPayload() {
  return { filename: 'processed-text.txt', content: batchText.value }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-textbatch">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
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
          {{ isEn ? 'Trim' : '首尾 Trim' }}
        </button>
        <button type="button" class="chip-btn" @click="applyBatchOp('upper')">UPPER</button>
        <button type="button" class="chip-btn" @click="applyBatchOp('lower')">lower</button>
      </div>

      <div class="tool-toolbar-group">
        <button type="button" class="pill-btn xs soft" @click="emit('copy', batchText)">
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy Text' : '复制文本' }}
        </button>
      </div>
    </div>

    <div class="batch-workspace" data-testid="text-batch-panel">
      <div class="affix-bar">
        <span class="affix-label">{{ isEn ? 'Batch Affix' : '批量加前后缀' }}</span>
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
          {{ isEn ? 'Apply Affix' : '应用前后缀' }}
        </button>
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
.batch-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.affix-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-canvas);
  flex-shrink: 0;
}

.affix-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.affix-input {
  width: 96px;
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
  .batch-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
