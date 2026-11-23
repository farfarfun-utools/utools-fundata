<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatTimestamp, parseDateToTimestamp } from '../../lib/decoders'
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

const tsInput = ref('1763819065')
const dateInput = ref('2026-11-22 21:44:25')

const tsInfo = computed(() => formatTimestamp(tsInput.value, props.settings.timeZone))
const dateParsed = computed(() => parseDateToTimestamp(dateInput.value))

function fillCurrentTime() {
  const now = Date.now()
  tsInput.value = String(Math.floor(now / 1000))
  const info = formatTimestamp(now, props.settings.timeZone)
  if (info) {
    dateInput.value = info.local
  }
}

function fillTodayStart() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  tsInput.value = String(Math.floor(start.getTime() / 1000))
  const info = formatTimestamp(start.getTime(), props.settings.timeZone)
  if (info) {
    dateInput.value = info.local
  }
}

watch(
  [tsInfo, () => props.settings.timeZone],
  () => {
    emit(
      'metrics',
      tsInfo.value ? `Unix ${tsInfo.value.seconds} · ${props.settings.timeZone}` : 'Unix Timestamp',
    )
  },
  { immediate: true },
)

function loadSample() {
  fillCurrentTime()
}

function applyInput(text: string) {
  const trimmed = text.trim()
  if (/^-?\d{10}$/.test(trimmed) || /^-?\d{13}$/.test(trimmed)) {
    tsInput.value = trimmed
    const info = formatTimestamp(trimmed, props.settings.timeZone)
    if (info) dateInput.value = info.local
    return
  }
  dateInput.value = trimmed
  const parsed = parseDateToTimestamp(trimmed)
  if (parsed) {
    tsInput.value = String(parsed.seconds)
  }
}

function getExportPayload() {
  const lines = tsInfo.value
    ? [
        `Seconds: ${tsInfo.value.seconds}`,
        `Milliseconds: ${tsInfo.value.milliseconds}`,
        `ISO 8601: ${tsInfo.value.iso}`,
        `RFC 2822: ${tsInfo.value.rfc2822}`,
        ...tsInfo.value.zones.map((z) => `${z.timeZone}: ${z.formatted}`),
      ].join('\n')
    : tsInput.value
  return { filename: 'timestamp.txt', content: lines }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-timestamp">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <button type="button" class="pill-btn xs primary" data-testid="ts-now-btn" @click="fillCurrentTime">
          <AppIcon name="clock" :size="12" />
          {{ isEn ? 'Current Time' : '填入当前时间' }}
        </button>
        <button type="button" class="pill-btn xs" @click="fillTodayStart">
          {{ isEn ? 'Today 00:00' : '今日零点' }}
        </button>
      </div>

      <div class="tool-toolbar-group">
        <button
          type="button"
          class="ghost-btn xs"
          :disabled="!tsInfo"
          @click="tsInfo && emit('copy', String(tsInfo.seconds))"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy (s)' : '复制秒级' }}
        </button>
        <button
          type="button"
          class="ghost-btn xs"
          :disabled="!tsInfo"
          @click="tsInfo && emit('copy', String(tsInfo.milliseconds))"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy (ms)' : '复制毫秒' }}
        </button>
        <button
          type="button"
          class="ghost-btn xs accent"
          :disabled="!tsInfo"
          @click="tsInfo && emit('copy', tsInfo.iso)"
        >
          <AppIcon name="copy" :size="12" />
          ISO 8601
        </button>
      </div>
    </div>

    <div class="tool-scroll ts-layout" data-testid="timestamp-panel">
      <div class="ts-cards-grid">
        <div class="studio-card ts-card">
          <div class="ts-card-head">
            <span class="ts-title">{{ isEn ? 'Unix Timestamp → Date' : '时间戳 → 日期时间' }}</span>
            <span class="badge badge-neutral">{{ isEn ? 's / ms auto' : '自动识别秒/毫秒' }}</span>
          </div>
          <div class="ts-input-row">
            <input
              v-model="tsInput"
              type="text"
              class="field-input mono ts-grow"
              data-testid="ts-input"
              placeholder="1763819065"
            />
            <button
              type="button"
              class="pill-btn xs"
              :disabled="!tsInfo"
              @click="tsInfo && emit('copy', tsInfo.iso)"
            >
              ISO
            </button>
          </div>

          <div v-if="tsInfo" class="ts-kv-list">
            <div class="ts-kv">
              <span class="ts-k">{{ isEn ? 'Seconds (s)' : '秒级 (s)' }}</span>
              <code class="mono tabular">{{ tsInfo.seconds }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', String(tsInfo.seconds))">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
            <div class="ts-kv">
              <span class="ts-k">{{ isEn ? 'Millis (ms)' : '毫秒级 (ms)' }}</span>
              <code class="mono tabular">{{ tsInfo.milliseconds }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', String(tsInfo.milliseconds))">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
            <div class="ts-kv">
              <span class="ts-k">ISO 8601</span>
              <code class="mono tabular">{{ tsInfo.iso }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', tsInfo.iso)">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
            <div class="ts-kv">
              <span class="ts-k">RFC 2822</span>
              <code class="mono tabular">{{ tsInfo.rfc2822 }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', tsInfo.rfc2822)">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
            <div class="ts-kv">
              <span class="ts-k">{{ isEn ? 'Relative' : '相对时间' }}</span>
              <span class="badge badge-accent">{{ tsInfo.relative }}</span>
            </div>
          </div>
          <div v-else class="ts-invalid">
            {{ isEn ? 'Enter a valid 10-digit or 13-digit Unix timestamp' : '请输入有效的 10 位（秒）或 13 位（毫秒）时间戳' }}
          </div>
        </div>

        <div class="studio-card ts-card">
          <div class="ts-card-head">
            <span class="ts-title">{{ isEn ? 'Date String → Timestamp' : '日期时间 → 时间戳' }}</span>
            <span class="badge badge-neutral">ISO / Local</span>
          </div>
          <div class="ts-input-row">
            <input
              v-model="dateInput"
              type="text"
              class="field-input mono ts-grow"
              data-testid="ts-date-input"
              placeholder="2026-11-22 21:44:25"
            />
          </div>
          <div v-if="dateParsed" class="ts-kv-list">
            <div class="ts-kv">
              <span class="ts-k">{{ isEn ? 'Unix (s)' : '秒级时间戳' }}</span>
              <code class="mono tabular">{{ dateParsed.seconds }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', String(dateParsed.seconds))">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
            <div class="ts-kv">
              <span class="ts-k">{{ isEn ? 'Unix (ms)' : '毫秒时间戳' }}</span>
              <code class="mono tabular">{{ dateParsed.milliseconds }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', String(dateParsed.milliseconds))">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
            <div class="ts-kv">
              <span class="ts-k">ISO 8601</span>
              <code class="mono tabular">{{ dateParsed.iso }}</code>
              <button type="button" class="icon-btn" @click="emit('copy', dateParsed.iso)">
                <AppIcon name="copy" :size="12" />
              </button>
            </div>
          </div>
          <div v-else class="ts-invalid">
            {{ isEn ? 'Unrecognized date format' : '无法解析该日期格式，支持 YYYY-MM-DD HH:mm:ss 或 ISO 8601' }}
          </div>
        </div>
      </div>

      <!-- Multi-Timezone Table -->
      <div v-if="tsInfo" class="studio-card tz-card">
        <div class="ts-card-head">
          <span class="ts-title">{{ isEn ? 'World Timezones' : '多时区同步对照' }}</span>
          <span class="badge badge-neutral">5 Zones</span>
        </div>
        <div class="tz-grid">
          <div v-for="z in tsInfo.zones" :key="z.timeZone" class="tz-row">
            <div class="tz-meta">
              <span class="tz-name">{{ z.timeZone }}</span>
              <span class="tz-sub">{{ z.label }}</span>
            </div>
            <code class="mono tabular tz-val">{{ z.formatted }}</code>
            <button type="button" class="icon-btn" @click="emit('copy', z.formatted)">
              <AppIcon name="copy" :size="12" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ts-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ts-card,
.tz-card {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ts-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ts-title {
  font-size: 12.5px;
  font-weight: 600;
}

.ts-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ts-grow {
  flex: 1;
  min-width: 0;
}

.ts-kv-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-kv {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  font-size: 12px;
}

.ts-k {
  width: 72px;
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 11.5px;
}

.ts-kv code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-invalid {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}

.tz-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tz-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
}

.tz-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 195px;
}

.tz-name {
  font-weight: 600;
  font-size: 12px;
}

.tz-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.tz-val {
  flex: 1;
  font-size: 12.5px;
}

@media (max-width: 640px) {
  .ts-cards-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .tz-meta {
    min-width: 120px;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }
}
</style>
