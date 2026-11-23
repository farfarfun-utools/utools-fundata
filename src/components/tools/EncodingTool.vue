<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { decodeText, encodeText, type EncodingKind } from '../../lib/decoders'
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

watch(
  [codecKind, codecDirection, codecResult],
  () => {
    emit(
      'metrics',
      `${codecKind.value.toUpperCase()} · ${codecDirection.value === 'encode' ? (isEn.value ? 'Encode' : '编码') : (isEn.value ? 'Decode' : '解码')} · ${codecResult.value.output.length} ${isEn.value ? 'chars' : '字符'}`,
    )
  },
  { immediate: true },
)

function loadSample() {
  codecKind.value = 'base64'
  codecDirection.value = 'encode'
  codecInput.value = '数形万变 FunData — 100% Offline Studio'
}

function applyInput(text: string) {
  const trimmed = text.trim()
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
  return {
    filename: `codec-${codecKind.value}.txt`,
    content: codecResult.value.output || codecInput.value,
  }
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
      </div>

      <div class="tool-toolbar-group">
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
    </div>

    <div v-if="codecResult.error" class="tool-error-banner">
      <AppIcon name="alert-circle" :size="14" />
      <span>{{ codecResult.error }}</span>
    </div>

    <div class="tool-split">
      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">
            {{
              codecDirection === 'encode'
                ? isEn
                  ? 'Plain Input'
                  : '原文输入'
                : isEn
                  ? 'Encoded Input'
                  : '编码输入'
            }}
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
  </div>
</template>
