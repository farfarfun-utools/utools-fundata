<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FunDataSettings } from '../../lib/storage'
import { convertColor, parseColor } from '../../lib/units'
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

watch(
  colorResult,
  (res) => {
    emit('metrics', res ? `${res.hex} · WCAG ${res.contrastWhite}:1` : 'Color')
  },
  { immediate: true },
)

function loadSample() {
  colorInput.value = '#6D4AFF'
}

function applyInput(text: string) {
  const trimmed = text.trim()
  if (parseColor(trimmed)) {
    colorInput.value = trimmed
  }
}

function getExportPayload() {
  if (!colorResult.value) return { filename: 'color-tokens.txt', content: colorInput.value }
  const c = colorResult.value
  return {
    filename: 'color-tokens.txt',
    content: [
      c.hex,
      c.rgb,
      c.rgbaStr,
      c.hsl,
      `WCAG vs White: ${c.contrastWhite}:1 (${c.gradeWhite})`,
      `WCAG vs Black: ${c.contrastBlack}:1 (${c.gradeBlack})`,
    ].join('\n'),
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-color">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <span class="swatch-label">{{ isEn ? 'Presets' : '常用色板' }}</span>
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

      <div class="tool-toolbar-group">
        <button
          type="button"
          class="pill-btn xs soft"
          :disabled="!colorResult"
          @click="colorResult && emit('copy', colorResult.hex)"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy HEX' : '复制 HEX' }}
        </button>
      </div>
    </div>

    <div class="tool-scroll color-scroll">
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
  </div>
</template>

<style scoped>
.color-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.swatch-label {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-right: 2px;
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

.color-formats-grid {
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

@media (max-width: 640px) {
  .color-top-grid,
  .color-formats-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
