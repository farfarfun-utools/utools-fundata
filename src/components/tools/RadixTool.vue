<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FunDataSettings } from '../../lib/storage'
import { convertRadix, type RadixBase } from '../../lib/units'
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

const radixFields = ref<Record<RadixBase, string>>({
  2: '1111111100001100',
  8: '177414',
  10: '65292',
  16: 'FF0C',
  36: '1EDM',
})
const radixError = ref('')
const radixBits = ref(16)

const RADIX_SPECS: Array<{ base: RadixBase; labelZh: string; labelEn: string; prefix: string }> = [
  { base: 2, labelZh: '二进制 (Binary)', labelEn: 'Binary (2)', prefix: '0b' },
  { base: 8, labelZh: '八进制 (Octal)', labelEn: 'Octal (8)', prefix: '0o' },
  { base: 10, labelZh: '十进制 (Decimal)', labelEn: 'Decimal (10)', prefix: '' },
  { base: 16, labelZh: '十六进制 (Hex)', labelEn: 'Hexadecimal (16)', prefix: '0x' },
  { base: 36, labelZh: 'Base36', labelEn: 'Base36 (36)', prefix: '' },
]

function onRadixEdit(base: RadixBase, raw: string) {
  radixFields.value[base] = raw
  if (!raw.trim()) {
    radixError.value = ''
    return
  }
  const converted = convertRadix(raw, base)
  if (!converted) {
    radixError.value = isEn.value ? `Invalid Base-${base} number` : `无效的 ${base} 进制数值`
    return
  }
  radixError.value = ''
  radixBits.value = converted.bitLength
  if (base !== 2) radixFields.value[2] = converted.binary
  if (base !== 8) radixFields.value[8] = converted.octal
  if (base !== 10) radixFields.value[10] = converted.decimal
  if (base !== 16) radixFields.value[16] = converted.hex
  if (base !== 36) radixFields.value[36] = converted.base36
}

watch(
  radixBits,
  (bits) => {
    emit('metrics', `BigInt Radix · ${bits} bits`)
  },
  { immediate: true },
)

function loadSample() {
  onRadixEdit(10, '9007199254740993')
}

function applyInput(text: string) {
  const trimmed = text.trim()
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    onRadixEdit(16, trimmed)
  } else if (/^0b[01]+$/i.test(trimmed)) {
    onRadixEdit(2, trimmed)
  } else if (/^0o[0-7]+$/i.test(trimmed)) {
    onRadixEdit(8, trimmed)
  } else if (/^-?\d+$/.test(trimmed)) {
    onRadixEdit(10, trimmed)
  }
}

function getExportPayload() {
  return {
    filename: 'radix.txt',
    content: RADIX_SPECS.map((s) => `${s.labelEn}: ${radixFields.value[s.base]}`).join('\n'),
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-radix">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <span class="badge badge-accent tabular">{{ radixBits }} bits</span>
        <button type="button" class="chip-btn" @click="onRadixEdit(10, '255')">255 (0xFF)</button>
        <button type="button" class="chip-btn" @click="onRadixEdit(10, '65535')">65535 (uint16)</button>
        <button type="button" class="chip-btn" @click="onRadixEdit(10, '9007199254740993')">2⁵³ + 1 (BigInt)</button>
      </div>

      <div class="tool-toolbar-group">
        <button type="button" class="ghost-btn xs" @click="onRadixEdit(10, '0')">
          {{ isEn ? 'Reset 0' : '归零' }}
        </button>
      </div>
    </div>

    <div class="tool-scroll radix-scroll" data-testid="radix-panel">
      <div v-if="radixError" class="tool-error-banner">
        <AppIcon name="alert-circle" :size="14" />
        <span>{{ radixError }}</span>
      </div>
      <div class="radix-list">
        <div v-for="spec in RADIX_SPECS" :key="spec.base" class="studio-card radix-row">
          <div class="radix-head">
            <span class="radix-label">{{ isEn ? spec.labelEn : spec.labelZh }}</span>
            <button
              type="button"
              class="ghost-btn xs"
              @click="emit('copy', radixFields[spec.base])"
            >
              <AppIcon name="copy" :size="12" />
              {{ isEn ? 'Copy' : '复制' }}
            </button>
          </div>
          <input
            :value="radixFields[spec.base]"
            type="text"
            class="field-input mono radix-input"
            :data-testid="`radix-input-${spec.base}`"
            spellcheck="false"
            @input="onRadixEdit(spec.base, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.radix-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radix-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radix-row {
  padding: 9px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.radix-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.radix-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.radix-input {
  width: 100%;
  font-size: 13px;
}
</style>
