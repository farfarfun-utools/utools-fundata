<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { generateIdBatch, type IdGeneratorKind } from '../../lib/crypto'
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

const idKind = ref<IdGeneratorKind>('uuid')
const idCount = ref(8)
const nanoLength = ref(21)
const generatedIds = ref<string[]>([])

const ID_KINDS: Array<{ id: IdGeneratorKind; label: string }> = [
  { id: 'uuid', label: 'UUID v4' },
  { id: 'ulid', label: 'ULID' },
  { id: 'nanoid', label: 'NanoID' },
  { id: 'hex32', label: 'Hex 32' },
  { id: 'hex64', label: 'Hex 64' },
  { id: 'base64url', label: 'Base64URL Secret' },
]

function regenerateIds() {
  generatedIds.value = generateIdBatch(idKind.value, idCount.value, {
    nanoIdLength: nanoLength.value,
  })
}

watch(
  [idKind, idCount, nanoLength],
  () => {
    regenerateIds()
  },
  { immediate: true },
)

watch(
  [idKind, generatedIds, isEn],
  () => {
    emit(
      'metrics',
      `${idKind.value.toUpperCase()} · ${generatedIds.value.length} ${isEn.value ? 'items' : '条'}`,
    )
  },
  { immediate: true },
)

function loadSample() {
  regenerateIds()
}

function getExportPayload() {
  return {
    filename: `${idKind.value}-batch.txt`,
    content: generatedIds.value.join('\n'),
  }
}

defineExpose({ loadSample, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-idgen">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <button
          v-for="item in ID_KINDS"
          :key="item.id"
          type="button"
          class="chip-btn"
          :class="{ active: idKind === item.id }"
          @click="idKind = item.id"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="tool-toolbar-group">
        <button type="button" class="pill-btn xs primary" data-testid="idgen-refresh-btn" @click="regenerateIds">
          <AppIcon name="refresh-cw" :size="12" />
          {{ isEn ? 'Regenerate' : '重新生成' }}
        </button>
        <button type="button" class="pill-btn xs soft" @click="emit('copy', generatedIds.join('\n'))">
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy All' : '复制全部' }}
        </button>
      </div>
    </div>

    <div class="tool-scroll idgen-scroll" data-testid="idgen-panel">
      <div class="studio-card idgen-controls">
        <div class="idgen-sliders">
          <label class="idgen-param">
            <span>{{ isEn ? 'Count' : '生成数量' }}:</span>
            <input v-model.number="idCount" type="range" min="1" max="50" step="1" />
            <span class="badge badge-accent tabular">{{ idCount }}</span>
          </label>

          <label v-if="idKind === 'nanoid'" class="idgen-param">
            <span>{{ isEn ? 'Length' : '长度' }}:</span>
            <input v-model.number="nanoLength" type="range" min="8" max="64" step="1" />
            <span class="badge badge-neutral tabular">{{ nanoLength }}</span>
          </label>
        </div>
      </div>

      <div class="idgen-list">
        <div
          v-for="(val, idx) in generatedIds"
          :key="`${idx}-${val}`"
          class="studio-card idgen-row"
        >
          <span class="idgen-idx tabular">{{ idx + 1 }}</span>
          <code class="idgen-val mono">{{ val }}</code>
          <button type="button" class="icon-btn" @click="emit('copy', val)">
            <AppIcon name="copy" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.idgen-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.idgen-controls {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.idgen-sliders {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.idgen-param {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.idgen-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.idgen-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px;
}

.idgen-idx {
  width: 22px;
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
}

.idgen-val {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  word-break: break-all;
}
</style>
