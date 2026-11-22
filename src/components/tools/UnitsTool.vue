<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FunDataSettings } from '../../lib/storage'
import {
  BYTE_UNITS,
  convertBytes,
  convertColor,
  convertRadix,
  parseColor,
  type ByteStandard,
  type ByteUnit,
  type RadixBase,
} from '../../lib/units'
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
const activeTab = ref<'color' | 'radix' | 'bytes'>('color')

// 1. Color state
const colorInput = ref('#6D4AFF')
const COLOR_SWATCHES = ['#6D4AFF', '#2563EB', '#059669', '#D97706', '#E11D48', '#171920', '#F8FAFC']

const colorResult = computed(() => {
  const parsed = parseColor(colorInput.value)
  return parsed ? convertColor(parsed) : null
})

function onPickerChange(event: Event) {
  const val = (event.target as HTMLInputElement).value
  colorInput.value = val.toUpperCase()
}

// 2. Radix state (BigInt-exact)
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

// 3. Bytes state
const byteValue = ref('2.5')
const byteUnit = ref<ByteUnit>('GB')
const byteStandard = ref<ByteStandard>('iec')

const byteRows = computed(() => {
  const num = Number(byteValue.value)
  return convertBytes(Number.isFinite(num) ? num : 0, byteUnit.value, byteStandard.value)
})

watch(
  [activeTab, colorResult, radixBits, byteValue, byteUnit, byteStandard],
  () => {
    if (activeTab.value === 'color') {
      emit('metrics', colorResult.value ? `${colorResult.value.hex} · WCAG ${colorResult.value.contrastWhite}:1` : 'Color')
    } else if (activeTab.value === 'radix') {
      emit('metrics', `BigInt Radix · ${radixBits.value} bits`)
    } else {
      emit('metrics', `${byteValue.value || 0} ${byteUnit.value} (${byteStandard.value.toUpperCase()})`)
    }
  },
  { immediate: true },
)

function loadSample() {
  if (activeTab.value === 'color') {
    colorInput.value = '#6D4AFF'
  } else if (activeTab.value === 'radix') {
    onRadixEdit(10, '9007199254740993')
  } else {
    byteValue.value = '2.5'
    byteUnit.value = 'GB'
    byteStandard.value = 'iec'
  }
}

function applyInput(text: string) {
  const trimmed = text.trim()
  if (parseColor(trimmed)) {
    activeTab.value = 'color'
    colorInput.value = trimmed
    return
  }
  if (/^(?:0x[0-9a-f]+|\d+)$/i.test(trimmed)) {
    activeTab.value = 'radix'
    onRadixEdit(trimmed.toLowerCase().startsWith('0x') ? 16 : 10, trimmed)
  }
}

function getExportPayload() {
  if (activeTab.value === 'color' && colorResult.value) {
    const c = colorResult.value
    return {
      filename: 'color-tokens.txt',
      content: [c.hex, c.rgb, c.rgbaStr, c.hsl, `WCAG vs White: ${c.contrastWhite}:1 (${c.gradeWhite})`, `WCAG vs Black: ${c.contrastBlack}:1 (${c.gradeBlack})`].join('\n'),
    }
  }
  if (activeTab.value === 'radix') {
    return {
      filename: 'radix.txt',
      content: RADIX_SPECS.map((s) => `${s.labelEn}: ${radixFields.value[s.base]}`).join('\n'),
    }
  }
  return {
    filename: 'bytes.txt',
    content: byteRows.value
      .map((r) => `${byteStandard.value === 'iec' ? r.iecLabel : r.siLabel}: ${r.formatted}`)
      .join('\n'),
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-units">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: activeTab === 'color' }"
            @click="activeTab = 'color'"
          >
            {{ isEn ? 'Color & WCAG' : '颜色与对比度' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="units-radix-tab"
            :class="{ active: activeTab === 'radix' }"
            @click="activeTab = 'radix'"
          >
            {{ isEn ? 'BigInt Radix' : '多进制换算' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="units-bytes-tab"
            :class="{ active: activeTab === 'bytes' }"
            @click="activeTab = 'bytes'"
          >
            {{ isEn ? 'Byte Units' : '字节单位' }}
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'color'" class="tool-toolbar-group">
        <button
          v-for="sw in COLOR_SWATCHES"
          :key="sw"
          type="button"
          class="swatch-dot"
          :style="{ background: sw }"
          :title="sw"
          @click="colorInput = sw"
        />
      </div>

      <div v-else-if="activeTab === 'radix'" class="tool-toolbar-group">
        <span class="badge badge-accent tabular">{{ radixBits }} bits</span>
        <button type="button" class="chip-btn" @click="onRadixEdit(10, '9007199254740993')">
          2⁵³ + 1
        </button>
      </div>

      <div v-else class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: byteStandard === 'iec' }"
            @click="byteStandard = 'iec'"
          >
            1024 (IEC)
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ active: byteStandard === 'si' }"
            @click="byteStandard = 'si'"
          >
            1000 (SI)
          </button>
        </div>
      </div>
    </div>

    <!-- Color Panel -->
    <div v-if="activeTab === 'color'" class="tool-scroll units-scroll">
      <div class="color-top-grid">
        <div
          class="color-hero-swatch"
          :style="{ background: colorResult ? colorResult.rgbaStr : '#6D4AFF' }"
        >
          <div class="swatch-sample light-text">
            <span>Aa {{ isEn ? 'White Text' : '白色文字' }}</span>
            <span v-if="colorResult" class="wcag-pill">
              {{ colorResult.contrastWhite }}:1 · {{ colorResult.gradeWhite }}
            </span>
          </div>
          <div class="swatch-sample dark-text">
            <span>Aa {{ isEn ? 'Black Text' : '黑色文字' }}</span>
            <span v-if="colorResult" class="wcag-pill dark">
              {{ colorResult.contrastBlack }}:1 · {{ colorResult.gradeBlack }}
            </span>
          </div>
        </div>

        <div class="studio-card color-input-card">
          <label class="field-lbl">{{ isEn ? 'Enter HEX / RGB / HSL' : '输入 HEX / RGB / RGBA / HSL' }}</label>
          <div class="color-picker-row">
            <input
              type="color"
              class="native-picker"
              :value="colorResult?.hex ?? '#6D4AFF'"
              @input="onPickerChange"
            />
            <input
              v-model="colorInput"
              type="text"
              class="field-input mono color-text-input"
              data-testid="color-input"
              placeholder="#6D4AFF / rgb(109, 74, 255) / hsl(251, 100%, 65%)"
            />
          </div>

          <div v-if="colorResult" class="wcag-summary-row">
            <div class="wcag-card">
              <span class="wcag-lbl">vs #FFFFFF</span>
              <strong class="tabular">{{ colorResult.contrastWhite }}:1</strong>
              <span
                class="badge"
                :class="colorResult.gradeWhite === 'Fail' ? 'badge-danger' : 'badge-success'"
              >
                {{ colorResult.gradeWhite }}
              </span>
            </div>
            <div class="wcag-card">
              <span class="wcag-lbl">vs #000000</span>
              <strong class="tabular">{{ colorResult.contrastBlack }}:1</strong>
              <span
                class="badge"
                :class="colorResult.gradeBlack === 'Fail' ? 'badge-danger' : 'badge-success'"
              >
                {{ colorResult.gradeBlack }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="colorResult" class="color-formats-grid">
        <div
          v-for="item in [
            { label: 'HEX', val: colorResult.hex },
            { label: 'HEX8', val: colorResult.hexAlpha },
            { label: 'RGB', val: colorResult.rgb },
            { label: 'RGBA', val: colorResult.rgbaStr },
            { label: 'HSL', val: colorResult.hsl },
            { label: 'HSLA', val: colorResult.hsla },
          ]"
          :key="item.label"
          class="studio-card unit-kv-card"
        >
          <span class="unit-kv-label">{{ item.label }}</span>
          <code class="unit-kv-val mono">{{ item.val }}</code>
          <button type="button" class="icon-btn" @click="emit('copy', item.val)">
            <AppIcon name="copy" :size="12" />
          </button>
        </div>
      </div>
      <div v-else class="tool-error-banner">
        <AppIcon name="alert-circle" :size="14" />
        <span>{{ isEn ? 'Unrecognized color value' : '无法解析颜色值，支持 #HEX、rgb()、hsl()' }}</span>
      </div>
    </div>

    <!-- Radix Panel -->
    <div v-else-if="activeTab === 'radix'" class="tool-scroll units-scroll" data-testid="radix-panel">
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

    <!-- Bytes Panel -->
    <div v-else class="tool-scroll units-scroll" data-testid="bytes-panel">
      <div class="studio-card byte-input-card">
        <input
          v-model="byteValue"
          type="number"
          min="0"
          step="any"
          class="field-input mono byte-num-input"
          data-testid="bytes-input"
        />
        <select v-model="byteUnit" class="pill-select" data-testid="bytes-unit-select">
          <option v-for="u in BYTE_UNITS" :key="u" :value="u">{{ u }}</option>
        </select>
        <span class="badge badge-neutral">
          {{ byteStandard === 'iec' ? '1 KiB = 1024 B' : '1 KB = 1000 B' }}
        </span>
      </div>

      <div class="byte-grid">
        <div v-for="row in byteRows" :key="row.unit" class="studio-card unit-kv-card">
          <span class="unit-kv-label">{{ byteStandard === 'iec' ? row.iecLabel : row.siLabel }}</span>
          <code class="unit-kv-val mono tabular">{{ row.formatted }}</code>
          <button
            type="button"
            class="icon-btn"
            @click="emit('copy', `${row.formatted} ${byteStandard === 'iec' ? row.iecLabel : row.siLabel}`)"
          >
            <AppIcon name="copy" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.units-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.swatch-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
}

.color-top-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
}

.color-hero-swatch {
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 126px;
}

.swatch-sample {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-size: 13.5px;
}

.swatch-sample.light-text {
  color: #ffffff;
}

.swatch-sample.dark-text {
  color: #111827;
}

.wcag-pill {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
}

.wcag-pill.dark {
  background: rgba(255, 255, 255, 0.45);
  color: #111827;
}

.color-input-card {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-lbl {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.native-picker {
  width: 34px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.color-text-input {
  flex: 1;
  min-width: 0;
}

.wcag-summary-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.wcag-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  font-size: 12px;
}

.wcag-lbl {
  color: var(--text-muted);
  font-size: 11px;
}

.color-formats-grid,
.byte-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.unit-kv-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.unit-kv-label {
  width: 52px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
}

.unit-kv-val {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.byte-input-card {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px;
}

.byte-num-input {
  width: 180px;
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .color-top-grid,
  .color-formats-grid,
  .byte-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
