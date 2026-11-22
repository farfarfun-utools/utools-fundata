<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  decodeText,
  encodeText,
  formatTimestamp,
  parseDateToTimestamp,
  type EncodingKind,
} from '../../lib/decoders'
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
const activeTab = ref<'codec' | 'timestamp'>('codec')

// Codec state
const codecKind = ref<EncodingKind>('base64')
const codecDirection = ref<'encode' | 'decode'>('encode')
const codecInput = ref('数形万变 FunData — 100% Offline Studio')

const CODEC_OPTIONS: Array<{ id: EncodingKind; label: string }> = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'unicode', label: 'Unicode \\u' },
  { id: 'html', label: 'HTML' },
  { id: 'hex', label: 'Hex' },
  { id: 'json-string', label: 'JSON Str' },
]

const codecResult = computed(() => {
  if (!codecInput.value) return { output: '', error: '' }
  try {
    const output =
      codecDirection.value === 'encode'
        ? encodeText(codecInput.value, codecKind.value)
        : decodeText(codecInput.value, codecKind.value)
    return { output, error: '' }
  } catch (err) {
    return {
      output: '',
      error: err instanceof Error ? err.message : 'Codec error',
    }
  }
})

function swapCodec() {
  if (!codecResult.value.output) return
  codecInput.value = codecResult.value.output
  codecDirection.value = codecDirection.value === 'encode' ? 'decode' : 'encode'
}

// Timestamp state
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

watch(
  [activeTab, codecKind, codecDirection, codecResult, tsInfo],
  () => {
    if (activeTab.value === 'codec') {
      emit(
        'metrics',
        `${codecKind.value.toUpperCase()} · ${codecDirection.value === 'encode' ? (isEn.value ? 'Encode' : '编码') : (isEn.value ? 'Decode' : '解码')} · ${codecResult.value.output.length} ${isEn.value ? 'chars' : '字符'}`,
      )
    } else {
      emit(
        'metrics',
        tsInfo.value ? `Unix ${tsInfo.value.seconds} · ${props.settings.timeZone}` : 'Timestamp',
      )
    }
  },
  { immediate: true },
)

function loadSample() {
  if (activeTab.value === 'codec') {
    codecKind.value = 'base64'
    codecDirection.value = 'encode'
    codecInput.value = '数形万变 FunData — 100% Offline Studio'
  } else {
    fillCurrentTime()
  }
}

function applyInput(text: string) {
  const trimmed = text.trim()
  if (/^-?\d{10}$/.test(trimmed) || /^-?\d{13}$/.test(trimmed)) {
    activeTab.value = 'timestamp'
    tsInput.value = trimmed
    return
  }
  activeTab.value = 'codec'
  codecInput.value = trimmed
  if (/%[0-9a-fA-F]{2}/.test(trimmed)) {
    codecKind.value = 'url'
    codecDirection.value = 'decode'
  } else if (/\\u[0-9a-fA-F]{4}/.test(trimmed)) {
    codecKind.value = 'unicode'
    codecDirection.value = 'decode'
  } else {
    codecKind.value = 'base64'
    codecDirection.value = 'decode'
  }
}

function getExportPayload() {
  if (activeTab.value === 'codec') {
    return {
      filename: `codec-${codecKind.value}.txt`,
      content: codecResult.value.output || codecInput.value,
    }
  }
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
  <div class="tool-workspace" data-testid="tool-encoding">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: activeTab === 'codec' }"
            @click="activeTab = 'codec'"
          >
            {{ isEn ? 'Text Codec' : '文本编解码' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="encoding-ts-tab"
            :class="{ active: activeTab === 'timestamp' }"
            @click="activeTab = 'timestamp'"
          >
            {{ isEn ? 'Unix Timestamp' : 'Unix 时间戳' }}
          </button>
        </div>

        <template v-if="activeTab === 'codec'">
          <div class="seg-control">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: codecDirection === 'encode' }"
              @click="codecDirection = 'encode'"
            >
              {{ isEn ? 'Encode' : '编码' }}
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: codecDirection === 'decode' }"
              @click="codecDirection = 'decode'"
            >
              {{ isEn ? 'Decode' : '解码' }}
            </button>
          </div>
          <button
            type="button"
            class="pill-btn xs"
            :disabled="!codecResult.output"
            @click="swapCodec"
          >
            <AppIcon name="arrows-left-right" :size="12" />
            {{ isEn ? 'Swap' : '互换' }}
          </button>
        </template>
      </div>

      <div v-if="activeTab === 'codec'" class="tool-toolbar-group">
        <button
          v-for="opt in CODEC_OPTIONS"
          :key="opt.id"
          type="button"
          class="chip-btn"
          :class="{ active: codecKind === opt.id }"
          @click="codecKind = opt.id"
        >
          {{ opt.label }}
        </button>
      </div>

      <div v-else class="tool-toolbar-group">
        <button type="button" class="pill-btn xs primary" data-testid="ts-now-btn" @click="fillCurrentTime">
          <AppIcon name="clock" :size="12" />
          {{ isEn ? 'Fill Current Time' : '填入当前时间' }}
        </button>
      </div>
    </div>

    <!-- Codec Panel -->
    <template v-if="activeTab === 'codec'">
      <div v-if="codecResult.error" class="tool-error-banner">
        <AppIcon name="alert-circle" :size="14" />
        <span>{{ codecResult.error }}</span>
      </div>

      <div class="tool-split">
        <div class="tool-pane">
          <div class="pane-header">
            <span class="pane-title">
              {{ codecDirection === 'encode' ? (isEn ? 'Plain Input' : '原文输入') : (isEn ? 'Encoded Input' : '编码输入') }}
            </span>
            <button type="button" class="ghost-btn xs" @click="codecInput = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
          <textarea
            v-model="codecInput"
            class="code-textarea"
            data-testid="codec-input"
            spellcheck="false"
          />
        </div>

        <div class="tool-pane">
          <div class="pane-header">
            <span class="pane-title">
              {{ isEn ? 'Result' : '转换结果' }}
              <span class="badge badge-accent">{{ codecKind.toUpperCase() }}</span>
            </span>
            <button
              type="button"
              class="ghost-btn xs accent"
              :disabled="!codecResult.output"
              @click="emit('copy', codecResult.output)"
            >
              <AppIcon name="copy" :size="13" />
              {{ isEn ? 'Copy' : '复制' }}
            </button>
          </div>
          <textarea
            :value="codecResult.output"
            class="code-textarea"
            data-testid="codec-output"
            readonly
            spellcheck="false"
          />
        </div>
      </div>
    </template>

    <!-- Timestamp Panel -->
    <div v-else class="tool-scroll ts-layout" data-testid="timestamp-panel">
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
