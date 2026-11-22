<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  decodeJwt,
  signJwtHmac,
  verifyJwtHmac,
  type DecodedJwt,
  type JwtHmacAlgorithm,
} from '../../lib/jwt'
import { SAMPLES, type FunDataSettings } from '../../lib/storage'
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
const mode = ref<'inspect' | 'sign'>('inspect')

// Inspect & Verify state
const tokenInput = ref<string>(SAMPLES.jwt)
const verifySecret = ref('fundata-secret')
const verifyResult = ref<{ valid: boolean; algorithm: string; reason: string } | null>(null)
const verifyBusy = ref(false)

const decodedState = computed<{ data: DecodedJwt | null; error: string }>(() => {
  if (!tokenInput.value.trim()) return { data: null, error: '' }
  try {
    return { data: decodeJwt(tokenInput.value), error: '' }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Invalid JWT' }
  }
})

watch([tokenInput, verifySecret], () => {
  verifyResult.value = null
})

async function runVerify() {
  verifyBusy.value = true
  try {
    verifyResult.value = await verifyJwtHmac(tokenInput.value, verifySecret.value)
  } finally {
    verifyBusy.value = false
  }
}

// Sign HMAC state
const signAlg = ref<JwtHmacAlgorithm>('HS256')
const signSecret = ref('fundata-secret')
const signHeaderText = ref(JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2))
const signPayloadText = ref(
  JSON.stringify(
    {
      sub: 'user_2026',
      name: 'Alice Chen',
      role: 'admin',
      iat: 1700000000,
      exp: 4102444800,
    },
    null,
    2,
  ),
)
const signedToken = ref('')
const signError = ref('')

async function runSign() {
  signError.value = ''
  try {
    const res = await signJwtHmac(signHeaderText.value, signPayloadText.value, signSecret.value, signAlg.value)
    signedToken.value = res.token
  } catch (err) {
    signedToken.value = ''
    signError.value = err instanceof Error ? err.message : 'Signing failed'
  }
}

watch(signAlg, (next) => {
  try {
    const parsed = JSON.parse(signHeaderText.value) as Record<string, unknown>
    parsed.alg = next
    signHeaderText.value = JSON.stringify(parsed, null, 2)
  } catch {
    // keep user text
  }
})

watch([signHeaderText, signPayloadText, signSecret, signAlg], () => {
  void runSign()
}, { immediate: true })

function inspectSignedToken() {
  if (!signedToken.value) return
  tokenInput.value = signedToken.value
  verifySecret.value = signSecret.value
  mode.value = 'inspect'
  void runVerify()
}

watch(
  [mode, decodedState, signAlg],
  () => {
    if (mode.value === 'inspect') {
      const d = decodedState.value.data
      emit('metrics', d ? `JWT ${d.algorithm} · ${d.status}` : 'JWT Inspector')
    } else {
      emit('metrics', `JWT Sign · ${signAlg.value}`)
    }
  },
  { immediate: true },
)

const statusBadgeClass = computed(() => {
  const s = decodedState.value.data?.status
  if (s === 'valid') return 'badge-success'
  if (s === 'expired') return 'badge-danger'
  if (s === 'not-yet-valid') return 'badge-warning'
  return 'badge-neutral'
})

function statusLabel(s: DecodedJwt['status']): string {
  if (isEn.value) {
    return s === 'valid'
      ? 'Valid'
      : s === 'expired'
        ? 'Expired'
        : s === 'not-yet-valid'
          ? 'Not Yet Valid'
          : 'No Exp'
  }
  return s === 'valid'
    ? '有效'
    : s === 'expired'
      ? '已过期'
      : s === 'not-yet-valid'
        ? '尚未生效'
        : '无过期时间'
}

function loadSample() {
  tokenInput.value = SAMPLES.jwt
  verifySecret.value = 'fundata-secret'
  mode.value = 'inspect'
}

function applyInput(text: string) {
  tokenInput.value = text.trim()
  mode.value = 'inspect'
}

function getExportPayload() {
  if (mode.value === 'sign' && signedToken.value) {
    return { filename: 'signed-jwt.txt', content: signedToken.value }
  }
  const d = decodedState.value.data
  const content = d
    ? JSON.stringify({ header: d.header, payload: d.payload, signature: d.signature }, null, 2)
    : tokenInput.value
  return { filename: 'jwt-decoded.json', content }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-jwt">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: mode === 'inspect' }"
            @click="mode = 'inspect'"
          >
            {{ isEn ? 'Inspect & Verify' : '解析与验签' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="jwt-sign-tab"
            :class="{ active: mode === 'sign' }"
            @click="mode = 'sign'"
          >
            {{ isEn ? 'Sign HMAC' : '离线签发' }}
          </button>
        </div>

        <template v-if="mode === 'inspect' && decodedState.data">
          <span class="badge badge-accent">{{ decodedState.data.algorithm }}</span>
          <span class="badge" :class="statusBadgeClass">
            {{ statusLabel(decodedState.data.status) }}
            <template v-if="decodedState.data.expiresIn"> · {{ decodedState.data.expiresIn }}</template>
          </span>
        </template>

        <template v-else-if="mode === 'sign'">
          <select v-model="signAlg" class="pill-select" data-testid="jwt-sign-alg">
            <option value="HS256">HS256 (SHA-256)</option>
            <option value="HS384">HS384 (SHA-384)</option>
            <option value="HS512">HS512 (SHA-512)</option>
          </select>
        </template>
      </div>

      <div class="tool-toolbar-group">
        <span class="badge badge-neutral">BigInt Safe · Web Crypto</span>
      </div>
    </div>

    <!-- Inspect Mode -->
    <div v-if="mode === 'inspect'" class="tool-scroll jwt-scroll">
      <div class="studio-card jwt-block">
        <div class="pane-header">
          <span class="pane-title">JWT Token</span>
          <button type="button" class="ghost-btn xs" @click="tokenInput = ''">
            {{ isEn ? 'Clear' : '清空' }}
          </button>
        </div>
        <textarea
          v-model="tokenInput"
          class="code-textarea jwt-token-area"
          data-testid="jwt-input"
          rows="3"
          spellcheck="false"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
        />
      </div>

      <div v-if="decodedState.error" class="tool-error-banner jwt-err">
        <AppIcon name="alert-circle" :size="14" />
        <span>{{ decodedState.error }}</span>
      </div>

      <template v-if="decodedState.data">
        <div class="jwt-claims-row">
          <span v-if="decodedState.data.issuedAt" class="badge badge-neutral">
            iat: {{ decodedState.data.issuedAt }}
          </span>
          <span v-if="decodedState.data.notBefore" class="badge badge-neutral">
            nbf: {{ decodedState.data.notBefore }}
          </span>
          <span v-if="decodedState.data.expiresAt" class="badge badge-neutral">
            exp: {{ decodedState.data.expiresAt }}
          </span>
        </div>

        <div class="jwt-json-grid">
          <div class="studio-card jwt-json-card">
            <div class="pane-header">
              <span class="pane-title">Header</span>
              <button
                type="button"
                class="ghost-btn xs"
                @click="emit('copy', decodedState.data.headerJson)"
              >
                <AppIcon name="copy" :size="12" />
                {{ isEn ? 'Copy' : '复制' }}
              </button>
            </div>
            <pre class="jwt-pre mono">{{ decodedState.data.headerJson }}</pre>
          </div>

          <div class="studio-card jwt-json-card">
            <div class="pane-header">
              <span class="pane-title">Payload</span>
              <button
                type="button"
                class="ghost-btn xs"
                @click="emit('copy', decodedState.data.payloadJson)"
              >
                <AppIcon name="copy" :size="12" />
                {{ isEn ? 'Copy' : '复制' }}
              </button>
            </div>
            <pre class="jwt-pre mono" data-testid="jwt-payload-pre">{{ decodedState.data.payloadJson }}</pre>
          </div>
        </div>

        <div class="studio-card jwt-verify-bar">
          <span class="pane-title">{{ isEn ? 'HMAC Verify' : 'HMAC 离线验签' }}</span>
          <input
            v-model="verifySecret"
            type="text"
            class="field-input mono jwt-secret-input"
            data-testid="jwt-secret-input"
            :placeholder="isEn ? 'Enter HMAC secret...' : '输入 HS256/384/512 密钥...'"
          />
          <button
            type="button"
            class="pill-btn primary"
            data-testid="jwt-verify-btn"
            :disabled="verifyBusy"
            @click="runVerify"
          >
            <AppIcon name="shield-check" :size="13" />
            {{ isEn ? 'Verify' : '校验签名' }}
          </button>
          <span
            v-if="verifyResult"
            class="badge"
            data-testid="jwt-verify-result"
            :class="verifyResult.valid ? 'badge-success' : 'badge-danger'"
          >
            {{ verifyResult.valid ? (isEn ? 'Signature Verified' : '签名有效') : verifyResult.reason }}
          </span>
        </div>
      </template>
    </div>

    <!-- Sign Mode -->
    <div v-else class="tool-scroll jwt-scroll" data-testid="jwt-sign-panel">
      <div class="jwt-json-grid">
        <div class="studio-card jwt-json-card">
          <div class="pane-header">
            <span class="pane-title">Header (JSON)</span>
          </div>
          <textarea
            v-model="signHeaderText"
            class="code-textarea jwt-edit-area"
            spellcheck="false"
          />
        </div>
        <div class="studio-card jwt-json-card">
          <div class="pane-header">
            <span class="pane-title">Payload (JSON)</span>
          </div>
          <textarea
            v-model="signPayloadText"
            class="code-textarea jwt-edit-area"
            data-testid="jwt-sign-payload"
            spellcheck="false"
          />
        </div>
      </div>

      <div class="studio-card jwt-verify-bar">
        <span class="pane-title">{{ isEn ? 'Signing Secret' : '签名密钥' }}</span>
        <input
          v-model="signSecret"
          type="text"
          class="field-input mono jwt-secret-input"
          data-testid="jwt-sign-secret"
          :placeholder="isEn ? 'Enter secret...' : '输入 HMAC 签名密钥...'"
        />
        <button type="button" class="pill-btn soft" :disabled="!signedToken" @click="inspectSignedToken">
          {{ isEn ? 'Inspect & Verify' : '加载并验签' }}
        </button>
        <button
          type="button"
          class="pill-btn primary"
          :disabled="!signedToken"
          @click="emit('copy', signedToken)"
        >
          <AppIcon name="copy" :size="13" />
          {{ isEn ? 'Copy JWT' : '复制令牌' }}
        </button>
      </div>

      <div v-if="signError" class="tool-error-banner jwt-err">
        <AppIcon name="alert-circle" :size="14" />
        <span>{{ signError }}</span>
      </div>

      <div v-else class="studio-card jwt-block">
        <div class="pane-header">
          <span class="pane-title">{{ isEn ? 'Generated Signed JWT' : '已签发 JWT 令牌' }}</span>
          <span class="badge badge-success">{{ signAlg }}</span>
        </div>
        <textarea
          :value="signedToken"
          class="code-textarea jwt-token-area"
          data-testid="jwt-signed-output"
          rows="4"
          readonly
          spellcheck="false"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.jwt-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jwt-block {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.jwt-token-area {
  height: 76px;
  word-break: break-all;
}

.jwt-err {
  border-radius: var(--radius-md);
  border: 1px solid rgba(207, 61, 76, 0.25);
}

.jwt-claims-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.jwt-json-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.jwt-json-card {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.jwt-pre {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.55;
  overflow: auto;
  max-height: 220px;
  white-space: pre-wrap;
  word-break: break-word;
}

.jwt-edit-area {
  height: 180px;
}

.jwt-verify-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
}

.jwt-secret-input {
  flex: 1;
  min-width: 160px;
}

@media (max-width: 640px) {
  .jwt-json-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
