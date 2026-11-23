<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CRON_PRESETS, parseCron } from '../../lib/cron'
import type { FunDataSettings } from '../../lib/storage'
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
const expression = ref('0 9 * * 1-5')
const timeZone = ref(props.settings.timeZone || 'Asia/Shanghai')

const TIMEZONES = [
  'Asia/Shanghai',
  'UTC',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
]

const parsed = computed(() =>
  parseCron(expression.value, {
    count: 10,
    timeZone: timeZone.value,
    locale: props.settings.locale,
  }),
)

watch(
  parsed,
  (res) => {
    if (!res.valid) {
      emit('metrics', isEn.value ? 'Invalid Cron' : 'Cron 表达式无效')
    } else {
      emit(
        'metrics',
        `${res.fieldCount}-${isEn.value ? 'field' : '位'} · ${res.timeZone} · ${res.nextRuns.length} ${isEn.value ? 'runs' : '次预测'}`,
      )
    }
  },
  { immediate: true },
)

function loadSample() {
  expression.value = '0 9 * * 1-5'
}

function applyInput(text: string) {
  expression.value = text.trim()
}

function getExportPayload() {
  const lines = [
    `Expression: ${parsed.value.expression}`,
    `Summary (ZH): ${parsed.value.descriptionZh}`,
    `Summary (EN): ${parsed.value.descriptionEn}`,
    `TimeZone: ${parsed.value.timeZone}`,
    '',
    ...parsed.value.nextRuns.map((r) => `${r.index}. ${r.formatted} (${r.iso})`),
  ].join('\n')
  return { filename: 'cron-schedule.txt', content: lines }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-cron">
    <div class="tool-toolbar">
      <div class="cron-input-group">
        <input
          v-model="expression"
          type="text"
          class="field-input mono cron-expr-input"
          data-testid="cron-input"
          spellcheck="false"
          placeholder="0 9 * * 1-5"
        />
        <span class="badge" :class="parsed.valid ? 'badge-accent' : 'badge-danger'">
          {{ parsed.valid ? `${parsed.fieldCount} ${isEn ? 'Fields' : '位'}` : (isEn ? 'Invalid' : '错误') }}
        </span>
      </div>

      <div class="tool-toolbar-group">
        <select v-model="timeZone" class="pill-select" data-testid="cron-tz-select">
          <option v-if="!TIMEZONES.includes(timeZone)" :value="timeZone">{{ timeZone }}</option>
          <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
        </select>
        <button
          type="button"
          class="pill-btn xs soft"
          :disabled="!parsed.valid"
          @click="emit('copy', parsed.nextRuns.map((r) => r.formatted).join('\n'))"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy 10 Runs' : '复制触发时间' }}
        </button>
      </div>
    </div>

    <div class="preset-bar">
      <span class="preset-label">{{ isEn ? 'Presets' : '常用预设' }}:</span>
      <button
        v-for="p in CRON_PRESETS"
        :key="p.id"
        type="button"
        class="chip-btn"
        :class="{ active: expression.trim() === p.expression }"
        @click="expression = p.expression"
      >
        {{ isEn ? p.labelEn : p.labelZh }}
      </button>
    </div>

    <div v-if="!parsed.valid" class="tool-error-banner">
      <AppIcon name="alert-circle" :size="14" />
      <span>{{ parsed.error }}</span>
    </div>

    <div v-else class="tool-scroll cron-scroll">
      <!-- Human-Readable Hero Summary -->
      <div class="cron-hero" data-testid="cron-summary">
        <div class="cron-hero-main">
          <span class="tone-badge tone-violet cron-hero-ico">
            <AppIcon name="clock" :size="16" />
          </span>
          <div class="cron-hero-text">
            <div class="cron-desc-primary">
              {{ isEn ? parsed.descriptionEn : parsed.descriptionZh }}
            </div>
            <div class="cron-desc-sub">
              {{ isEn ? parsed.descriptionZh : parsed.descriptionEn }}
            </div>
          </div>
        </div>
        <div class="cron-fields-row">
          <div v-for="f in parsed.fields" :key="f.key" class="cron-field-chip">
            <span class="cf-label">{{ isEn ? f.labelEn : f.labelZh }}</span>
            <code class="cf-raw mono">{{ f.raw }}</code>
            <span class="cf-sum">{{ isEn ? f.summaryEn : f.summaryZh }}</span>
          </div>
        </div>
      </div>

      <!-- Next 10 Trigger Timestamps -->
      <div class="studio-card cron-runs-card" data-testid="cron-runs-table">
        <div class="pane-header">
          <span class="pane-title">
            {{ isEn ? 'Next 10 Trigger Timestamps' : '未来 10 次精确触发时间' }}
            <span class="badge badge-neutral">{{ parsed.timeZone }}</span>
          </span>
        </div>
        <table class="cron-table">
          <thead>
            <tr>
              <th class="col-n">#</th>
              <th>{{ isEn ? 'Local Time' : '本地时间' }}</th>
              <th>ISO 8601 (UTC)</th>
              <th>{{ isEn ? 'Relative' : '距离现在' }}</th>
              <th class="col-act"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in parsed.nextRuns" :key="run.index">
              <td class="col-n tabular">{{ run.index }}</td>
              <td class="mono tabular run-local">{{ run.formatted }}</td>
              <td class="mono tabular run-iso">{{ run.iso }}</td>
              <td><span class="badge badge-neutral">{{ run.relative }}</span></td>
              <td class="col-act">
                <button type="button" class="icon-btn" @click="emit('copy', run.formatted)">
                  <AppIcon name="copy" :size="12" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cron-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 180px;
}

.cron-expr-input {
  width: 240px;
  max-width: 100%;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.preset-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-canvas);
  flex-shrink: 0;
}

.preset-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.cron-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.cron-hero {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-accent);
  background: var(--accent-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cron-hero-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cron-hero-ico {
  width: 32px;
  height: 32px;
  background: var(--bg-panel);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.cron-hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cron-desc-primary {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.cron-desc-sub {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.cron-fields-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 6px;
}

.cron-field-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  border: 1px solid var(--border);
}

.cf-label {
  font-size: 10.5px;
  color: var(--text-muted);
  font-weight: 600;
}

.cf-raw {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}

.cf-sum {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.3;
  word-break: break-word;
}

.cron-runs-card {
  overflow: hidden;
}

.cron-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.cron-table th {
  text-align: left;
  padding: 5px 10px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.cron-table td {
  padding: 3.5px 10px;
  border-bottom: 1px solid var(--border);
}

.cron-table tr:last-child td {
  border-bottom: none;
}

.col-n {
  width: 30px;
  color: var(--text-muted);
}

.run-local {
  font-weight: 600;
  color: var(--text-primary);
}

.run-iso {
  color: var(--text-secondary);
  font-size: 11.5px;
}

.col-act {
  width: 34px;
  text-align: right;
}
</style>
