<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CONVERT_FORMATS,
  CONVERT_SAMPLES,
  convertFormat,
  type ConvertFormat,
} from '../../lib/converter'
import type { IndentOption } from '../../lib/formats'
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
const sourceFormat = ref<ConvertFormat | 'auto'>('auto')
const targetFormat = ref<ConvertFormat>('yaml')
const indent = ref<IndentOption>(props.settings.defaultIndent)
const inputText = ref(CONVERT_SAMPLES.json)

const result = computed(() => {
  if (!inputText.value.trim()) {
    return { output: '', detectedFrom: null as ConvertFormat | null, error: '' }
  }
  try {
    const res = convertFormat(inputText.value, sourceFormat.value, targetFormat.value, indent.value)
    return { output: res.output, detectedFrom: res.detectedFrom, error: '' }
  } catch (err) {
    return {
      output: '',
      detectedFrom: null as ConvertFormat | null,
      error: err instanceof Error ? err.message : 'Conversion failed',
    }
  }
})

watch(
  [inputText, result, targetFormat],
  () => {
    const inLines = inputText.value ? inputText.value.split(/\r?\n/).length : 0
    const outLines = result.value.output ? result.value.output.split(/\r?\n/).length : 0
    const fromLabel = (result.value.detectedFrom ?? sourceFormat.value).toUpperCase()
    emit('metrics', `${fromLabel} → ${targetFormat.value.toUpperCase()} · ${inLines} → ${outLines} ${isEn.value ? 'lines' : '行'}`)
  },
  { immediate: true },
)

function swapFormats() {
  if (!result.value.output) return
  const prevTarget = targetFormat.value
  const prevSource = result.value.detectedFrom ?? (sourceFormat.value === 'auto' ? 'json' : sourceFormat.value)
  inputText.value = result.value.output
  sourceFormat.value = prevTarget
  targetFormat.value = prevSource
}

function loadFormatSample(fmt: ConvertFormat) {
  sourceFormat.value = fmt
  inputText.value = CONVERT_SAMPLES[fmt]
  if (targetFormat.value === fmt) {
    targetFormat.value = fmt === 'json' ? 'yaml' : 'json'
  }
}

function loadSample() {
  sourceFormat.value = 'auto'
  targetFormat.value = 'yaml'
  inputText.value = CONVERT_SAMPLES.json
}

function applyInput(text: string) {
  sourceFormat.value = 'auto'
  inputText.value = text
  const detected = result.value.detectedFrom
  if (detected === targetFormat.value) {
    targetFormat.value = detected === 'json' ? 'yaml' : 'json'
  }
}

function getExportPayload() {
  const extMap: Record<ConvertFormat, string> = {
    json: 'json',
    json5: 'json5',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    csv: 'csv',
    tsv: 'tsv',
    ini: 'ini',
    ndjson: 'ndjson',
    query: 'txt',
  }
  return {
    filename: `converted.${extMap[targetFormat.value]}`,
    content: result.value.output || inputText.value,
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-convert">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <select v-model="sourceFormat" class="pill-select" data-testid="convert-from-select">
          <option value="auto">{{ isEn ? 'Auto Detect' : '自动识别' }}</option>
          <option v-for="fmt in CONVERT_FORMATS" :key="fmt.id" :value="fmt.id">
            {{ fmt.label }}
          </option>
        </select>

        <button
          type="button"
          class="icon-btn"
          data-testid="convert-swap-btn"
          :title="isEn ? 'Swap input & output' : '互换输入与输出'"
          :disabled="!result.output"
          @click="swapFormats"
        >
          <AppIcon name="arrows-left-right" :size="14" />
        </button>

        <select v-model="targetFormat" class="pill-select" data-testid="convert-to-select">
          <option v-for="fmt in CONVERT_FORMATS" :key="fmt.id" :value="fmt.id">
            {{ fmt.label }}
          </option>
        </select>

        <select v-model="indent" class="pill-select">
          <option value="2">2 Spaces</option>
          <option value="4">4 Spaces</option>
          <option value="tab">Tab</option>
        </select>

        <span v-if="result.detectedFrom && sourceFormat === 'auto'" class="badge badge-accent">
          {{ isEn ? 'Detected' : '识别为' }}: {{ result.detectedFrom.toUpperCase() }}
        </span>
      </div>

      <div class="tool-toolbar-group">
        <button
          v-for="quick in (['json', 'yaml', 'toml', 'xml', 'csv', 'query'] as ConvertFormat[])"
          :key="quick"
          type="button"
          class="chip-btn"
          @click="loadFormatSample(quick)"
        >
          {{ quick.toUpperCase() }}
        </button>
      </div>
    </div>

    <div v-if="result.error" class="tool-error-banner">
      <AppIcon name="alert-circle" :size="14" />
      <span>{{ result.error }}</span>
    </div>

    <div class="tool-split">
      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">
            {{ isEn ? 'Source Input' : '源数据输入' }}
            <span class="badge badge-neutral">{{ (result.detectedFrom ?? sourceFormat).toUpperCase() }}</span>
          </span>
          <div class="tool-toolbar-group">
            <button type="button" class="ghost-btn xs" @click="inputText = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="inputText"
          class="code-textarea"
          data-testid="convert-input"
          spellcheck="false"
          :placeholder="isEn ? 'Paste JSON, YAML, TOML, XML, CSV, INI, NDJSON or URL Query...' : '粘贴 JSON / YAML / TOML / XML / CSV / INI / NDJSON 或 URL Query...'"
        />
      </div>

      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">
            {{ isEn ? 'Converted Output' : '转换结果' }}
            <span class="badge badge-accent">{{ targetFormat.toUpperCase() }}</span>
          </span>
          <div class="tool-toolbar-group">
            <button
              type="button"
              class="ghost-btn xs accent"
              data-testid="convert-copy-btn"
              :disabled="!result.output"
              @click="emit('copy', result.output)"
            >
              <AppIcon name="copy" :size="13" />
              {{ isEn ? 'Copy' : '复制' }}
            </button>
            <button
              type="button"
              class="ghost-btn xs"
              :disabled="!result.output"
              @click="emit('export', getExportPayload())"
            >
              <AppIcon name="download" :size="13" />
              {{ isEn ? 'Export' : '导出' }}
            </button>
          </div>
        </div>
        <textarea
          :value="result.output"
          class="code-textarea"
          data-testid="convert-output"
          readonly
          spellcheck="false"
        />
      </div>
    </div>
  </div>
</template>
