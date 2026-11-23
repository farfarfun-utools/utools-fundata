<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FunDataSettings } from '../../lib/storage'
import { BYTE_UNITS, convertBytes, type ByteStandard, type ByteUnit } from '../../lib/units'
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

const byteValue = ref('2.5')
const byteUnit = ref<ByteUnit>('GB')
const byteStandard = ref<ByteStandard>('iec')

const byteRows = computed(() => {
  const num = Number(byteValue.value)
  return convertBytes(Number.isFinite(num) ? num : 0, byteUnit.value, byteStandard.value)
})

watch(
  [byteValue, byteUnit, byteStandard],
  () => {
    emit('metrics', `${byteValue.value || 0} ${byteUnit.value} (${byteStandard.value.toUpperCase()})`)
  },
  { immediate: true },
)

function loadSample() {
  byteValue.value = '2.5'
  byteUnit.value = 'GB'
  byteStandard.value = 'iec'
}

function getExportPayload() {
  return {
    filename: 'bytes.txt',
    content: byteRows.value
      .map((r) => `${byteStandard.value === 'iec' ? r.iecLabel : r.siLabel}: ${r.formatted}`)
      .join('\n'),
  }
}

defineExpose({ loadSample, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-bytes">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
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
        <span class="badge badge-neutral">
          {{ byteStandard === 'iec' ? '1 KiB = 1024 B' : '1 KB = 1000 B' }}
        </span>
      </div>

      <div class="tool-toolbar-group">
        <button type="button" class="chip-btn" @click="byteValue = '1024'; byteUnit = 'MB'">1024 MB</button>
        <button type="button" class="chip-btn" @click="byteValue = '1'; byteUnit = 'TB'">1 TB</button>
        <button
          type="button"
          class="pill-btn xs soft"
          @click="
            emit(
              'copy',
              byteRows
                .map((r) => `${byteStandard === 'iec' ? r.iecLabel : r.siLabel}: ${r.formatted}`)
                .join('\n'),
            )
          "
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy All' : '复制全部' }}
        </button>
      </div>
    </div>

    <div class="tool-scroll bytes-scroll" data-testid="bytes-panel">
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
        <span class="badge badge-accent">
          {{ byteStandard === 'iec' ? 'Binary (KiB / MiB / GiB)' : 'Decimal (KB / MB / GB)' }}
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
.bytes-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

@media (max-width: 640px) {
  .byte-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
