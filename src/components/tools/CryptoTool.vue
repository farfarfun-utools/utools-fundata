<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  computeAllHashes,
  generateIdBatch,
  type HashEncoding,
  type HashRow,
  type IdGeneratorKind,
} from '../../lib/crypto'
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
const activeTab = ref<'hash' | 'idgen'>('hash')

// Hash / HMAC state
const hashInput = ref('FunData 数形万变 — Offline Hash & HMAC Studio')
const hmacSecret = ref('')
const hashEncoding = ref<HashEncoding>('hex')
const hashRows = ref<HashRow[]>([])
let hashSeq = 0

async function recomputeHashes() {
  const seq = ++hashSeq
  try {
    const rows = await computeAllHashes(hashInput.value, {
      hmacKey: hmacSecret.value || undefined,
      encoding: hashEncoding.value,
    })
    if (seq === hashSeq) {
      hashRows.value = rows
    }
  } catch {
    if (seq === hashSeq) {
      hashRows.value = []
    }
  }
}

watch([hashInput, hmacSecret, hashEncoding], () => {
  void recomputeHashes()
}, { immediate: true })

// ID / Secret Generator state
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

watch([idKind, idCount, nanoLength], () => {
  regenerateIds()
}, { immediate: true })

watch(
  [activeTab, hmacSecret, hashEncoding, idKind, generatedIds],
  () => {
    if (activeTab.value === 'hash') {
      emit(
        'metrics',
        `${hmacSecret.value ? 'HMAC' : 'Digest'} · 5 ${isEn.value ? 'algorithms' : '算法'} · ${hashEncoding.value}`,
      )
    } else {
      emit('metrics', `${idKind.value.toUpperCase()} · ${generatedIds.value.length} ${isEn.value ? 'items' : '条'}`)
    }
  },
  { immediate: true },
)

function loadSample() {
  if (activeTab.value === 'hash') {
    hashInput.value = 'FunData 数形万变 — Offline Hash & HMAC Studio'
    hmacSecret.value = 'studio-hmac-key'
  } else {
    regenerateIds()
  }
}

function applyInput(text: string) {
  activeTab.value = 'hash'
  hashInput.value = text
}

function getExportPayload() {
  if (activeTab.value === 'hash') {
    const content = hashRows.value.map((r) => `${r.label}: ${r.value}`).join('\n')
    return { filename: 'hashes.txt', content }
  }
  return {
    filename: `${idKind.value}-batch.txt`,
    content: generatedIds.value.join('\n'),
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-crypto">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: activeTab === 'hash' }"
            @click="activeTab = 'hash'"
          >
            {{ isEn ? 'Hash & HMAC' : '哈希与 HMAC' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="crypto-idgen-tab"
            :class="{ active: activeTab === 'idgen' }"
            @click="activeTab = 'idgen'"
          >
            {{ isEn ? 'UUID & Secret Gen' : 'UUID 与密钥生成' }}
          </button>
        </div>

        <template v-if="activeTab === 'hash'">
          <div class="seg-control">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: hashEncoding === 'hex' }"
              @click="hashEncoding = 'hex'"
            >
              hex
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: hashEncoding === 'HEX' }"
              @click="hashEncoding = 'HEX'"
            >
              HEX
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: hashEncoding === 'base64' }"
              @click="hashEncoding = 'base64'"
            >
              Base64
            </button>
          </div>
          <span v-if="hmacSecret" class="badge badge-accent">HMAC Mode</span>
        </template>
      </div>

      <div v-if="activeTab === 'idgen'" class="tool-toolbar-group">
        <button type="button" class="pill-btn xs primary" data-testid="idgen-refresh-btn" @click="regenerateIds">
          <AppIcon name="refresh-cw" :size="12" />
          {{ isEn ? 'Regenerate' : '重新生成' }}
        </button>
        <button
          type="button"
          class="pill-btn xs soft"
          @click="emit('copy', generatedIds.join('\n'))"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy All' : '复制全部' }}
        </button>
      </div>
    </div>

    <!-- Hash / HMAC Mode -->
    <div v-if="activeTab === 'hash'" class="tool-scroll crypto-scroll">
      <div class="crypto-inputs-grid">
        <div class="studio-card crypto-box">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Input Text (UTF-8)' : '输入文本 (UTF-8)' }}</span>
            <button type="button" class="ghost-btn xs" @click="hashInput = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
          <textarea
            v-model="hashInput"
            class="code-textarea hash-area"
            data-testid="hash-input"
            spellcheck="false"
            :placeholder="isEn ? 'Type or paste text to hash...' : '输入或粘贴要计算摘要的文本...'"
          />
        </div>

        <div class="studio-card crypto-box hmac-box">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Optional HMAC Secret' : '可选 HMAC 密钥' }}</span>
            <button
              v-if="hmacSecret"
              type="button"
              class="ghost-btn xs"
              @click="hmacSecret = ''"
            >
              {{ isEn ? 'Disable' : '清除' }}
            </button>
          </div>
          <div class="hmac-body">
            <input
              v-model="hmacSecret"
              type="text"
              class="field-input mono"
              data-testid="hmac-secret-input"
              :placeholder="isEn ? 'Leave empty for standard digest...' : '留空为普通哈希，填写即切换 HMAC...'"
            />
            <span class="hmac-hint">
              {{
                isEn
                  ? 'Computes MD5 (pure TS) + SHA-1 / SHA-256 / SHA-384 / SHA-512 (Web Crypto) in real time.'
                  : '实时并行计算 MD5（纯 TS）与 SHA-1/256/384/512（Web Crypto），全程本地离线。'
              }}
            </span>
          </div>
        </div>
      </div>

      <div class="hash-list" data-testid="hash-results">
        <div
          v-for="row in hashRows"
          :key="row.algorithm"
          class="studio-card hash-row"
          :data-testid="`hash-row-${row.algorithm}`"
        >
          <div class="hash-row-meta">
            <span class="hash-alg">{{ hmacSecret ? `HMAC-${row.label}` : row.label }}</span>
            <span class="badge badge-neutral">{{ row.bits }}b</span>
          </div>
          <code class="hash-val mono">{{ row.value }}</code>
          <button
            type="button"
            class="pill-btn xs"
            @click="emit('copy', row.value)"
          >
            <AppIcon name="copy" :size="12" />
            {{ isEn ? 'Copy' : '复制' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ID / Secret Batch Generator Mode -->
    <div v-else class="tool-scroll crypto-scroll" data-testid="idgen-panel">
      <div class="studio-card idgen-controls">
        <div class="idgen-chips">
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
.crypto-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.crypto-inputs-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 10px;
}

.crypto-box {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.hash-area {
  height: 92px;
}

.hmac-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hmac-hint {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
}

.hash-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.hash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.hash-row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 132px;
  flex-shrink: 0;
}

.hash-alg {
  font-weight: 600;
  font-size: 12px;
}

.hash-val {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}

.idgen-controls {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.idgen-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

@media (max-width: 640px) {
  .crypto-inputs-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .hash-row {
    flex-wrap: wrap;
  }
  .hash-row-meta {
    width: auto;
  }
}
</style>
