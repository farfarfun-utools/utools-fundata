<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { computeAllHashes, type HashEncoding, type HashRow } from '../../lib/crypto'
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

watch(
  [hashInput, hmacSecret, hashEncoding],
  () => {
    void recomputeHashes()
  },
  { immediate: true },
)

watch(
  [hmacSecret, hashEncoding, isEn],
  () => {
    emit(
      'metrics',
      `${hmacSecret.value ? 'HMAC' : 'Digest'} · 5 ${isEn.value ? 'algorithms' : '算法'} · ${hashEncoding.value}`,
    )
  },
  { immediate: true },
)

function loadSample() {
  hashInput.value = 'FunData 数形万变 — Offline Hash & HMAC Studio'
  hmacSecret.value = 'studio-hmac-key'
}

function applyInput(text: string) {
  hashInput.value = text
}

function getExportPayload() {
  const content = hashRows.value.map((r) => `${r.label}: ${r.value}`).join('\n')
  return { filename: 'hashes.txt', content }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-hash">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
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
      </div>

      <div class="tool-toolbar-group">
        <button
          type="button"
          class="pill-btn xs soft"
          :disabled="hashRows.length === 0"
          @click="emit('copy', hashRows.map((r) => `${r.label}: ${r.value}`).join('\n'))"
        >
          <AppIcon name="copy" :size="12" />
          {{ isEn ? 'Copy All' : '复制全部' }}
        </button>
      </div>
    </div>

    <div class="tool-scroll crypto-scroll">
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
          <button type="button" class="pill-btn xs" @click="emit('copy', row.value)">
            <AppIcon name="copy" :size="12" />
            {{ isEn ? 'Copy' : '复制' }}
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
