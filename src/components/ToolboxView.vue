<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { repairJsonWithAi } from '../lib/ai-repair'
import { CONVERT_FORMATS, convertFormat, type ConvertFormat } from '../lib/converter'
import {
  decodeText,
  encodeText,
  formatTimestamp,
  parseDateToTimestamp,
  type EncodingKind,
} from '../lib/decoders'
import { computeDiff } from '../lib/diff'
import { repairJsonLocal, type DataFormat, type IndentOption } from '../lib/formats'
import { t } from '../lib/i18n'
import { JSONPATH_EXAMPLES, runJsonPath } from '../lib/jsonpath'
import { decodeJwt, verifyJwtHmac, type DecodedJwt } from '../lib/jwt'
import { convertJsonKeys, NAMING_STYLES, type NamingStyle } from '../lib/keynaming'
import { renumberProto } from '../lib/proto'
import { SAMPLES, type FunDataSettings, type ToolId } from '../lib/storage'
import { generateTypes, TARGET_LANGUAGES, type TargetLanguage } from '../lib/typegen'

const props = defineProps<{
  activeTool: ToolId
  currentContent: string
  currentFormat: DataFormat
  indent: IndentOption
  settings: FunDataSettings
}>()

const emit = defineEmits<{
  'update:activeTool': [tool: ToolId]
  'apply-to-tab': [payload: { content: string; format?: DataFormat }]
  'open-new-tab': [payload: { content: string; format: DataFormat; title?: string }]
  copy: [text: string]
  export: [payload: { filename: string; content: string }]
  notify: [payload: { message: string; kind?: 'info' | 'success' | 'error' }]
}>()

const TOOL_LIST: Array<{ id: ToolId; icon: string; key: string }> = [
  { id: 'repair', icon: '✦', key: 'tool.repair' },
  { id: 'types', icon: '{}', key: 'tool.types' },
  { id: 'convert', icon: '⇄', key: 'tool.convert' },
  { id: 'jsonpath', icon: '$.', key: 'tool.jsonpath' },
  { id: 'naming', icon: 'Aa', key: 'tool.naming' },
  { id: 'encoding', icon: '01', key: 'tool.encoding' },
  { id: 'jwt', icon: 'ID', key: 'tool.jwt' },
  { id: 'proto', icon: '#', key: 'tool.proto' },
]

// 1. Repair state
const repairInput = ref("{ name: 'FunData', version: 1, tags: ['offline', 'fast',], active: true }")
const repairOutput = ref('')
const repairSource = ref<'local' | 'utools-ai' | 'openai' | null>(null)
const repairError = ref('')
const repairBusy = ref(false)

const repairDiff = computed(() =>
  repairOutput.value ? computeDiff(repairInput.value, repairOutput.value) : null,
)

async function runRepair(useAi = false) {
  repairError.value = ''
  repairBusy.value = true
  try {
    if (!useAi || props.settings.ai.provider === 'local') {
      const res = repairJsonLocal(repairInput.value, props.indent)
      repairOutput.value = res.output
      repairSource.value = 'local'
    } else {
      const res = await repairJsonWithAi(repairInput.value, {
        ...props.settings.ai,
        indent: props.indent,
      })
      repairOutput.value = res.output
      repairSource.value = res.source
    }
  } catch (err) {
    repairError.value = err instanceof Error ? err.message : 'Repair failed'
  } finally {
    repairBusy.value = false
  }
}

// 2. Types state
const typesInput = ref(props.currentFormat === 'json' && props.currentContent ? props.currentContent : SAMPLES.json)
const typesLang = ref<TargetLanguage>('typescript')
const typesRootName = ref('UserPayload')

const typesResult = computed<{ output: string; error: string }>(() => {
  if (!typesInput.value.trim()) return { output: '', error: '' }
  try {
    return { output: generateTypes(typesInput.value, typesLang.value, typesRootName.value), error: '' }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Type generation failed' }
  }
})

const activeLangMeta = computed(
  () => TARGET_LANGUAGES.find((item) => item.id === typesLang.value) ?? TARGET_LANGUAGES[0],
)

// 3. Convert state
const convertInput = ref(props.currentContent || SAMPLES.json)
const convertFrom = ref<ConvertFormat | 'auto'>('auto')
const convertTo = ref<ConvertFormat>('yaml')

const convertResult = computed<{ output: string; detectedFrom?: ConvertFormat; error: string }>(() => {
  if (!convertInput.value.trim()) return { output: '', error: '' }
  try {
    const res = convertFormat(convertInput.value, convertFrom.value, convertTo.value, props.indent)
    return { output: res.output, detectedFrom: res.detectedFrom, error: '' }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Conversion failed' }
  }
})

function swapConvert() {
  if (!convertResult.value.output) return
  const prevTarget = convertTo.value
  const prevSource = convertResult.value.detectedFrom ?? (convertFrom.value === 'auto' ? 'json' : convertFrom.value)
  convertInput.value = convertResult.value.output
  convertFrom.value = prevTarget
  convertTo.value = prevSource
}

function mapConvertFormatToDataFormat(fmt: ConvertFormat): DataFormat {
  if (fmt === 'query') return 'text'
  return fmt
}

// 4. JSONPath state
const jpInput = ref(props.currentFormat === 'json' && props.currentContent ? props.currentContent : SAMPLES.json)
const jpExpr = ref('$.users[?@.score >= 90].name')
const jpResult = computed(() => runJsonPath(jpInput.value, jpExpr.value))

// 5. Key Naming state
const namingInput = ref(
  JSON.stringify(
    {
      user_id: 1001,
      first_name: 'Alice',
      created_at: 1732272000,
      keep_raw: true,
      nested_profile: { last_login_ip: '127.0.0.1' },
    },
    null,
    2,
  ),
)
const namingStyle = ref<NamingStyle>('camel')
const namingIgnore = ref('keep_raw')

const namingResult = computed<{ output: string; error: string }>(() => {
  if (!namingInput.value.trim()) return { output: '', error: '' }
  try {
    const ignoreList = namingIgnore.value
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    return {
      output: convertJsonKeys(namingInput.value, namingStyle.value, ignoreList, props.indent),
      error: '',
    }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Key naming failed' }
  }
})

const namingDiff = computed(() =>
  namingResult.value.output ? computeDiff(namingInput.value, namingResult.value.output) : null,
)

// 6. Encoding & Timestamp state
const ENCODING_KINDS: Array<{ id: EncodingKind; label: string }> = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'html', label: 'HTML' },
  { id: 'hex', label: 'Hex' },
  { id: 'json-string', label: 'JSON String' },
]
const encodingKind = ref<EncodingKind>('base64')
const encodingInput = ref('数形万变 FunData')
const encodingOutput = ref(encodeText('数形万变 FunData', 'base64'))
const encodingError = ref('')

function runEncode() {
  encodingError.value = ''
  try {
    encodingOutput.value = encodeText(encodingInput.value, encodingKind.value)
  } catch (err) {
    encodingError.value = err instanceof Error ? err.message : 'Encode failed'
  }
}

function runDecode() {
  encodingError.value = ''
  try {
    encodingOutput.value = decodeText(encodingInput.value, encodingKind.value)
  } catch (err) {
    encodingError.value = err instanceof Error ? err.message : 'Decode failed'
  }
}

const tsInput = ref('1732272000')
const dateInput = ref('2024-11-22 18:40:00')

const tsDecoded = computed(() => formatTimestamp(tsInput.value, props.settings.timeZone))
const dateParsed = computed(() => parseDateToTimestamp(dateInput.value))

function fillCurrentTimestamp() {
  const now = Math.floor(Date.now() / 1000)
  tsInput.value = String(now)
  const info = formatTimestamp(now, props.settings.timeZone)
  if (info) dateInput.value = info.iso
}

// 7. JWT state
const jwtInput = ref<string>(SAMPLES.jwt)
const jwtSecret = ref('fundata-secret')
const jwtVerifyState = ref<{ valid: boolean; algorithm: string; reason: string } | null>(null)

const jwtDecoded = computed<{ data?: DecodedJwt; error: string }>(() => {
  if (!jwtInput.value.trim()) return { error: '' }
  try {
    return { data: decodeJwt(jwtInput.value), error: '' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid JWT' }
  }
})

watch([jwtInput, jwtSecret], () => {
  jwtVerifyState.value = null
})

async function runJwtVerify() {
  jwtVerifyState.value = await verifyJwtHmac(jwtInput.value, jwtSecret.value)
}

// 8. Protobuf state
const protoInput = ref<string>(SAMPLES.protobuf)
const protoShowDiff = ref(false)
const protoResult = computed(() => renumberProto(protoInput.value))
const protoDiff = computed(() => computeDiff(protoInput.value, protoResult.value.output))

function loadFromCurrentTab() {
  const content = props.currentContent
  switch (props.activeTool) {
    case 'repair':
      repairInput.value = content
      void runRepair(false)
      break
    case 'types':
      typesInput.value = content
      break
    case 'convert':
      convertInput.value = content
      break
    case 'jsonpath':
      jpInput.value = content
      break
    case 'naming':
      namingInput.value = content
      break
    case 'encoding':
      encodingInput.value = content
      break
    case 'jwt':
      jwtInput.value = content
      break
    case 'proto':
      protoInput.value = content
      break
  }
  emit('notify', {
    message: props.settings.locale === 'en' ? 'Loaded from active tab' : '已载入当前标签内容',
    kind: 'info',
  })
}

function loadSampleForTool() {
  switch (props.activeTool) {
    case 'repair':
      repairInput.value = "{ service: 'fundata', items: [1, 2, 3,], enabled: true, // comment\n}"
      void runRepair(false)
      break
    case 'types':
      typesInput.value = SAMPLES.json
      break
    case 'convert':
      convertInput.value = SAMPLES.json
      convertFrom.value = 'json'
      convertTo.value = 'yaml'
      break
    case 'jsonpath':
      jpInput.value = SAMPLES.json
      jpExpr.value = '$.users[?@.score >= 90].name'
      break
    case 'naming':
      namingInput.value = JSON.stringify(
        { user_id: 1001, first_name: 'Alice', nested_info: { created_at: 1732272000 } },
        null,
        2,
      )
      break
    case 'encoding':
      encodingInput.value = '数形万变 FunData'
      encodingKind.value = 'base64'
      runEncode()
      break
    case 'jwt':
      jwtInput.value = SAMPLES.jwt
      jwtSecret.value = 'fundata-secret'
      break
    case 'proto':
      protoInput.value = SAMPLES.protobuf
      break
  }
}

// Run initial local repair so repair panel isn't blank
void runRepair(false)
</script>

<template>
  <div class="toolbox-layout" data-testid="toolbox-view">
    <aside class="tool-rail" aria-label="Toolbox navigation">
      <button
        v-for="item in TOOL_LIST"
        :key="item.id"
        type="button"
        class="rail-btn"
        :class="{ active: activeTool === item.id }"
        :data-testid="`tool-btn-${item.id}`"
        @click="emit('update:activeTool', item.id)"
      >
        <span class="rail-icon mono">{{ item.icon }}</span>
        <span class="rail-label">{{ t(settings.locale, item.key) }}</span>
      </button>
    </aside>

    <section class="tool-stage">
      <header class="tool-header">
        <div class="tool-title-group">
          <h2 class="tool-title">{{ t(settings.locale, `tool.${activeTool}`) }}</h2>
        </div>
        <div class="tool-header-actions">
          <button type="button" class="pill-btn xs" @click="loadFromCurrentTab">
            {{ settings.locale === 'en' ? 'Load Tab' : '载入当前标签' }}
          </button>
          <button type="button" class="pill-btn xs" @click="loadSampleForTool">
            {{ t(settings.locale, 'action.sample') }}
          </button>
        </div>
      </header>

      <!-- 1. JSON Repair -->
      <div v-if="activeTool === 'repair'" class="tool-body" data-testid="tool-panel-repair">
        <div class="tool-subbar">
          <button type="button" class="pill-btn primary xs" :disabled="repairBusy" @click="runRepair(false)">
            {{ settings.locale === 'en' ? 'Local Repair' : '本地修复' }}
          </button>
          <button
            v-if="settings.ai.provider !== 'local'"
            type="button"
            class="pill-btn soft xs"
            :disabled="repairBusy"
            @click="runRepair(true)"
          >
            {{ repairBusy ? '...' : settings.locale === 'en' ? 'AI Repair' : 'AI 智能修复' }}
          </button>
          <span v-if="repairSource" class="badge badge-accent">{{ repairSource }}</span>
          <span v-if="repairDiff" class="badge badge-neutral tabular">
            +{{ repairDiff.stats.added }} / -{{ repairDiff.stats.removed }} / ~{{ repairDiff.stats.modified }}
          </span>
          <span v-if="repairError" class="badge badge-danger">{{ repairError }}</span>
          <div class="spacer" />
          <button type="button" class="pill-btn xs" :disabled="!repairOutput" @click="emit('copy', repairOutput)">
            {{ t(settings.locale, 'action.copy') }}
          </button>
          <button
            type="button"
            class="pill-btn xs"
            :disabled="!repairOutput"
            @click="emit('apply-to-tab', { content: repairOutput, format: 'json' })"
          >
            {{ t(settings.locale, 'action.apply') }}
          </button>
          <button
            type="button"
            class="pill-btn soft xs"
            :disabled="!repairOutput"
            @click="emit('open-new-tab', { content: repairOutput, format: 'json', title: 'Repaired JSON' })"
          >
            {{ settings.locale === 'en' ? 'New Tab' : '新建标签' }}
          </button>
        </div>
        <div class="split-2">
          <div class="pane-box">
            <div class="pane-title">{{ settings.locale === 'en' ? 'Broken JSON Input' : '待修复输入' }}</div>
            <textarea v-model="repairInput" class="code-textarea" spellcheck="false" />
          </div>
          <div class="pane-box">
            <div class="pane-title">{{ settings.locale === 'en' ? 'Repaired Output' : '修复结果' }}</div>
            <textarea :value="repairOutput" readonly class="code-textarea" spellcheck="false" />
          </div>
        </div>
      </div>

      <!-- 2. Type Generator -->
      <div v-else-if="activeTool === 'types'" class="tool-body" data-testid="tool-panel-types">
        <div class="tool-subbar wrap">
          <div class="chip-strip">
            <button
              v-for="lang in TARGET_LANGUAGES"
              :key="lang.id"
              type="button"
              class="chip-btn"
              :class="{ active: typesLang === lang.id }"
              @click="typesLang = lang.id"
            >
              {{ lang.label }}
            </button>
          </div>
          <input
            v-model="typesRootName"
            type="text"
            class="field-input mono root-name-input"
            :placeholder="settings.locale === 'en' ? 'Root Name' : '根类型名'"
            aria-label="Root type name"
          />
          <button type="button" class="pill-btn xs" :disabled="!typesResult.output" @click="emit('copy', typesResult.output)">
            {{ t(settings.locale, 'action.copy') }}
          </button>
          <button
            type="button"
            class="pill-btn xs"
            :disabled="!typesResult.output"
            @click="
              emit('export', {
                filename: `${typesRootName || 'Root'}.${activeLangMeta.ext}`,
                content: typesResult.output,
              })
            "
          >
            {{ settings.locale === 'en' ? 'Export' : '导出' }}
          </button>
          <button
            type="button"
            class="pill-btn soft xs"
            :disabled="!typesResult.output"
            @click="
              emit('open-new-tab', {
                content: typesResult.output,
                format: typesLang === 'typescript' ? 'typescript' : typesLang === 'jsonschema' ? 'json' : 'text',
                title: `${typesRootName || 'Root'}.${activeLangMeta.ext}`,
              })
            "
          >
            {{ settings.locale === 'en' ? 'New Tab' : '新标签' }}
          </button>
        </div>
        <div v-if="typesResult.error" class="inline-err">{{ typesResult.error }}</div>
        <div class="split-2">
          <div class="pane-box">
            <div class="pane-title">JSON / JSON5</div>
            <textarea v-model="typesInput" class="code-textarea" spellcheck="false" />
          </div>
          <div class="pane-box">
            <div class="pane-title">{{ activeLangMeta.label }}</div>
            <textarea
              :value="typesResult.output"
              readonly
              class="code-textarea"
              spellcheck="false"
              data-testid="types-output"
            />
          </div>
        </div>
      </div>

      <!-- 3. Data Format Converter -->
      <div v-else-if="activeTool === 'convert'" class="tool-body" data-testid="tool-panel-convert">
        <div class="tool-subbar wrap">
          <select v-model="convertFrom" class="pill-select" aria-label="Source format">
            <option value="auto">{{ settings.locale === 'en' ? 'Auto Detect' : '自动识别' }}</option>
            <option v-for="fmt in CONVERT_FORMATS" :key="fmt.id" :value="fmt.id">{{ fmt.label }}</option>
          </select>
          <button type="button" class="pill-btn xs" @click="swapConvert">⇄</button>
          <select v-model="convertTo" class="pill-select" aria-label="Target format">
            <option v-for="fmt in CONVERT_FORMATS" :key="fmt.id" :value="fmt.id">{{ fmt.label }}</option>
          </select>
          <span v-if="convertResult.detectedFrom" class="badge badge-accent">
            {{ convertResult.detectedFrom.toUpperCase() }} → {{ convertTo.toUpperCase() }}
          </span>
          <div class="spacer" />
          <button type="button" class="pill-btn xs" :disabled="!convertResult.output" @click="emit('copy', convertResult.output)">
            {{ t(settings.locale, 'action.copy') }}
          </button>
          <button
            type="button"
            class="pill-btn soft xs"
            :disabled="!convertResult.output"
            @click="
              emit('open-new-tab', {
                content: convertResult.output,
                format: mapConvertFormatToDataFormat(convertTo),
                title: `Converted.${convertTo}`,
              })
            "
          >
            {{ settings.locale === 'en' ? 'New Tab' : '新建标签' }}
          </button>
        </div>
        <div v-if="convertResult.error" class="inline-err">{{ convertResult.error }}</div>
        <div class="split-2">
          <div class="pane-box">
            <div class="pane-title">{{ settings.locale === 'en' ? 'Source' : '源数据' }}</div>
            <textarea v-model="convertInput" class="code-textarea" spellcheck="false" />
          </div>
          <div class="pane-box">
            <div class="pane-title">{{ convertTo.toUpperCase() }}</div>
            <textarea
              :value="convertResult.output"
              readonly
              class="code-textarea"
              spellcheck="false"
              data-testid="convert-output"
            />
          </div>
        </div>
      </div>

      <!-- 4. JSONPath Playground -->
      <div v-else-if="activeTool === 'jsonpath'" class="tool-body" data-testid="tool-panel-jsonpath">
        <div class="tool-subbar wrap">
          <input
            v-model="jpExpr"
            type="text"
            class="field-input mono grow-input"
            placeholder="$.users[*].name"
            aria-label="JSONPath playground expression"
          />
          <span v-if="!jpResult.error" class="badge badge-success">
            {{ t(settings.locale, 'status.matches', { count: jpResult.count }) }}
          </span>
          <span v-else class="badge badge-danger">{{ jpResult.error }}</span>
          <button type="button" class="pill-btn xs" :disabled="Boolean(jpResult.error)" @click="emit('copy', jpResult.formatted)">
            {{ t(settings.locale, 'action.copy') }}
          </button>
          <button
            type="button"
            class="pill-btn soft xs"
            :disabled="Boolean(jpResult.error)"
            @click="emit('open-new-tab', { content: jpResult.formatted, format: 'json', title: 'JSONPath Result' })"
          >
            {{ settings.locale === 'en' ? 'New Tab' : '新建标签' }}
          </button>
        </div>
        <div class="chip-bar">
          <button
            v-for="ex in JSONPATH_EXAMPLES"
            :key="ex.id"
            type="button"
            class="chip-btn"
            :class="{ active: jpExpr === ex.expression }"
            @click="jpExpr = ex.expression"
          >
            {{ settings.locale === 'en' ? ex.titleEn : ex.titleZh }}
          </button>
        </div>
        <div class="split-2">
          <div class="pane-box">
            <div class="pane-title">JSON</div>
            <textarea v-model="jpInput" class="code-textarea" spellcheck="false" />
          </div>
          <div class="pane-box">
            <div class="pane-title">
              {{ settings.locale === 'en' ? 'Matches & Paths' : '匹配结果与路径' }}
            </div>
            <textarea :value="jpResult.formatted" readonly class="code-textarea" spellcheck="false" />
            <div v-if="jpResult.paths.length > 0" class="paths-strip mono">
              <span v-for="p in jpResult.paths.slice(0, 12)" :key="p" class="badge badge-neutral">{{ p }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Key Naming Converter -->
      <div v-else-if="activeTool === 'naming'" class="tool-body" data-testid="tool-panel-naming">
        <div class="tool-subbar wrap">
          <div class="chip-strip">
            <button
              v-for="style in NAMING_STYLES"
              :key="style.id"
              type="button"
              class="chip-btn mono"
              :class="{ active: namingStyle === style.id }"
              :title="style.example"
              @click="namingStyle = style.id"
            >
              {{ style.label }}
            </button>
          </div>
          <input
            v-model="namingIgnore"
            type="text"
            class="field-input mono root-name-input"
            :placeholder="settings.locale === 'en' ? 'Ignore keys (comma)' : '忽略键（逗号分隔）'"
          />
          <span v-if="namingDiff" class="badge badge-neutral tabular">
            ~{{ namingDiff.stats.modified }}
          </span>
          <button type="button" class="pill-btn xs" :disabled="!namingResult.output" @click="emit('copy', namingResult.output)">
            {{ t(settings.locale, 'action.copy') }}
          </button>
          <button
            type="button"
            class="pill-btn xs"
            :disabled="!namingResult.output"
            @click="emit('apply-to-tab', { content: namingResult.output, format: 'json' })"
          >
            {{ t(settings.locale, 'action.apply') }}
          </button>
          <button
            type="button"
            class="pill-btn soft xs"
            :disabled="!namingResult.output"
            @click="emit('open-new-tab', { content: namingResult.output, format: 'json', title: `Keys (${namingStyle})` })"
          >
            {{ settings.locale === 'en' ? 'New Tab' : '新建标签' }}
          </button>
        </div>
        <div v-if="namingResult.error" class="inline-err">{{ namingResult.error }}</div>
        <div class="split-2">
          <div class="pane-box">
            <div class="pane-title">{{ settings.locale === 'en' ? 'Input JSON' : '原始 JSON' }}</div>
            <textarea v-model="namingInput" class="code-textarea" spellcheck="false" />
          </div>
          <div class="pane-box">
            <div class="pane-title">{{ namingStyle }}</div>
            <textarea :value="namingResult.output" readonly class="code-textarea" spellcheck="false" />
          </div>
        </div>
      </div>

      <!-- 6. Encoding & Timestamp -->
      <div v-else-if="activeTool === 'encoding'" class="tool-body scroll-body" data-testid="tool-panel-encoding">
        <div class="section-card">
          <div class="tool-subbar wrap no-border">
            <div class="chip-strip">
              <button
                v-for="k in ENCODING_KINDS"
                :key="k.id"
                type="button"
                class="chip-btn"
                :class="{ active: encodingKind === k.id }"
                @click="encodingKind = k.id"
              >
                {{ k.label }}
              </button>
            </div>
            <button type="button" class="pill-btn primary xs" @click="runEncode">
              {{ settings.locale === 'en' ? 'Encode →' : '编码 →' }}
            </button>
            <button type="button" class="pill-btn soft xs" @click="runDecode">
              {{ settings.locale === 'en' ? 'Decode →' : '解码 →' }}
            </button>
            <button type="button" class="pill-btn xs" :disabled="!encodingOutput" @click="emit('copy', encodingOutput)">
              {{ t(settings.locale, 'action.copy') }}
            </button>
          </div>
          <div v-if="encodingError" class="inline-err">{{ encodingError }}</div>
          <div class="split-2 compact-split">
            <textarea v-model="encodingInput" class="code-textarea bordered-box" spellcheck="false" />
            <textarea :value="encodingOutput" readonly class="code-textarea bordered-box" spellcheck="false" />
          </div>
        </div>

        <div class="section-card">
          <div class="card-head">
            <strong>{{ settings.locale === 'en' ? 'Timestamp ↔ DateTime' : '时间戳 ↔ 日期时间' }}</strong>
            <span class="badge badge-neutral">{{ settings.timeZone }}</span>
            <button type="button" class="pill-btn xs" @click="fillCurrentTimestamp">
              {{ settings.locale === 'en' ? 'Now' : '当前时间' }}
            </button>
          </div>
          <div class="ts-grid">
            <div class="ts-col">
              <label class="mini-label">{{ settings.locale === 'en' ? 'Unix Timestamp (s / ms)' : 'Unix 时间戳（秒 / 毫秒）' }}</label>
              <input v-model="tsInput" type="text" class="field-input mono" />
              <div v-if="tsDecoded" class="ts-result mono tabular">
                <div><strong>Local:</strong> {{ tsDecoded.local }}</div>
                <div><strong>ISO:</strong> {{ tsDecoded.iso }}</div>
                <div><strong>Relative:</strong> {{ tsDecoded.relative }}</div>
              </div>
            </div>
            <div class="ts-col">
              <label class="mini-label">{{ settings.locale === 'en' ? 'Date / ISO String' : '日期时间 / ISO 字符串' }}</label>
              <input v-model="dateInput" type="text" class="field-input mono" />
              <div v-if="dateParsed" class="ts-result mono tabular">
                <div><strong>Seconds:</strong> {{ dateParsed.seconds }}</div>
                <div><strong>Millis:</strong> {{ dateParsed.milliseconds }}</div>
                <div><strong>ISO:</strong> {{ dateParsed.iso }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 7. JWT Inspector -->
      <div v-else-if="activeTool === 'jwt'" class="tool-body scroll-body" data-testid="tool-panel-jwt">
        <div class="section-card">
          <div class="card-head">
            <strong>JWT Token</strong>
            <template v-if="jwtDecoded.data">
              <span class="badge badge-accent mono">{{ jwtDecoded.data.algorithm }}</span>
              <span
                class="badge"
                :class="
                  jwtDecoded.data.status === 'valid'
                    ? 'badge-success'
                    : jwtDecoded.data.status === 'expired'
                      ? 'badge-danger'
                      : 'badge-warning'
                "
              >
                {{
                  jwtDecoded.data.status === 'valid'
                    ? t(settings.locale, 'jwt.valid')
                    : jwtDecoded.data.status === 'expired'
                      ? t(settings.locale, 'jwt.expired')
                      : jwtDecoded.data.status === 'not-yet-valid'
                        ? t(settings.locale, 'jwt.notYetValid')
                        : t(settings.locale, 'jwt.noExp')
                }}
                <template v-if="jwtDecoded.data.expiresIn"> ({{ jwtDecoded.data.expiresIn }})</template>
              </span>
            </template>
            <button
              v-if="jwtDecoded.data"
              type="button"
              class="pill-btn soft xs"
              @click="
                emit('open-new-tab', {
                  content: jwtDecoded.data.payloadJson,
                  format: 'json',
                  title: 'JWT Payload',
                })
              "
            >
              {{ settings.locale === 'en' ? 'Open Payload in Tab' : '新标签打开 Payload' }}
            </button>
          </div>
          <textarea v-model="jwtInput" class="code-textarea jwt-input bordered-box" spellcheck="false" />
          <div v-if="jwtDecoded.error" class="inline-err">{{ jwtDecoded.error }}</div>
        </div>

        <div v-if="jwtDecoded.data" class="split-2 jwt-split">
          <div class="pane-box bordered-box">
            <div class="pane-title">
              <span>Header</span>
              <button type="button" class="pill-btn xs" @click="emit('copy', jwtDecoded.data.headerJson)">
                {{ t(settings.locale, 'action.copy') }}
              </button>
            </div>
            <pre class="jwt-pre mono">{{ jwtDecoded.data.headerJson }}</pre>
          </div>
          <div class="pane-box bordered-box">
            <div class="pane-title">
              <span>Payload</span>
              <button type="button" class="pill-btn xs" @click="emit('copy', jwtDecoded.data.payloadJson)">
                {{ t(settings.locale, 'action.copy') }}
              </button>
            </div>
            <pre class="jwt-pre mono" data-testid="jwt-payload-out">{{ jwtDecoded.data.payloadJson }}</pre>
          </div>
        </div>

        <div v-if="jwtDecoded.data" class="section-card">
          <div class="verify-row">
            <input
              v-model="jwtSecret"
              type="text"
              class="field-input mono grow-input"
              :placeholder="settings.locale === 'en' ? 'HMAC Secret (HS256/384/512)' : '输入 HMAC Secret 离线验签'"
            />
            <button type="button" class="pill-btn primary xs" @click="runJwtVerify">
              {{ t(settings.locale, 'action.verify') }}
            </button>
            <span
              v-if="jwtVerifyState"
              class="badge"
              :class="jwtVerifyState.valid ? 'badge-success' : 'badge-danger'"
            >
              {{ jwtVerifyState.valid ? '✓ ' : '✗ ' }}{{ jwtVerifyState.reason }}
            </span>
          </div>
        </div>
      </div>

      <!-- 8. Protobuf Renumber -->
      <div v-else-if="activeTool === 'proto'" class="tool-body" data-testid="tool-panel-proto">
        <div class="tool-subbar wrap">
          <span
            class="badge"
            :class="protoResult.changes > 0 ? 'badge-accent' : 'badge-success'"
          >
            {{
              protoResult.changes > 0
                ? t(settings.locale, 'status.changes', { count: protoResult.changes })
                : t(settings.locale, 'status.noChanges')
            }}
          </span>
          <label class="toggle-inline">
            <input v-model="protoShowDiff" type="checkbox" />
            <span>{{ settings.locale === 'en' ? 'Diff View' : '差异视图' }}</span>
          </label>
          <div class="spacer" />
          <button type="button" class="pill-btn xs" @click="emit('copy', protoResult.output)">
            {{ t(settings.locale, 'action.copy') }}
          </button>
          <button
            type="button"
            class="pill-btn xs"
            @click="emit('export', { filename: 'renumbered.proto', content: protoResult.output })"
          >
            {{ settings.locale === 'en' ? 'Export .proto' : '导出 .proto' }}
          </button>
          <button
            type="button"
            class="pill-btn xs"
            @click="emit('apply-to-tab', { content: protoResult.output, format: 'protobuf' })"
          >
            {{ t(settings.locale, 'action.apply') }}
          </button>
          <button
            type="button"
            class="pill-btn soft xs"
            @click="emit('open-new-tab', { content: protoResult.output, format: 'protobuf', title: 'renumbered.proto' })"
          >
            {{ settings.locale === 'en' ? 'New Tab' : '新建标签' }}
          </button>
        </div>

        <div v-if="!protoShowDiff" class="split-2">
          <div class="pane-box">
            <div class="pane-title">{{ settings.locale === 'en' ? 'Source .proto' : '原始 .proto' }}</div>
            <textarea v-model="protoInput" class="code-textarea" spellcheck="false" />
          </div>
          <div class="pane-box">
            <div class="pane-title">{{ settings.locale === 'en' ? 'Renumbered .proto' : '重编号结果' }}</div>
            <textarea :value="protoResult.output" readonly class="code-textarea" spellcheck="false" />
          </div>
        </div>

        <div v-else class="proto-diff-list mono">
          <div
            v-for="(row, idx) in protoDiff.rows"
            :key="idx"
            class="pdiff-row"
            :class="`prow-${row.kind}`"
          >
            <div class="pdiff-cell">
              <span class="pdiff-ln tabular">{{ row.leftLine ?? '' }}</span>
              <span>{{ row.leftText }}</span>
            </div>
            <div class="pdiff-cell">
              <span class="pdiff-ln tabular">{{ row.rightLine ?? '' }}</span>
              <span>{{ row.rightText }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.toolbox-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--bg-canvas);
}

.tool-rail {
  width: 146px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
}

.rail-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 130ms ease;
}

.rail-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.rail-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--accent);
}

.rail-icon {
  width: 20px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.tool-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-panel);
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  flex-shrink: 0;
}

.tool-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.tool-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scroll-body {
  overflow-y: auto;
  padding: 10px 12px;
  gap: 10px;
}

.tool-subbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  flex-shrink: 0;
}

.tool-subbar.wrap {
  flex-wrap: wrap;
}

.tool-subbar.no-border {
  border-bottom: none;
  padding: 0;
}

.spacer {
  flex: 1;
}

.chip-strip,
.chip-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.chip-bar {
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.root-name-input {
  width: 148px;
  height: 24px;
}

.grow-input {
  flex: 1;
  min-width: 140px;
  height: 26px;
}

.inline-err {
  padding: 5px 10px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  border-bottom: 1px solid var(--border);
}

.split-2 {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
}

.compact-split {
  min-height: 130px;
  gap: 8px;
}

.pane-box {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.split-2 > .pane-box:first-child:not(.bordered-box) {
  border-right: 1px solid var(--border);
}

.bordered-box {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
}

.paths-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
  max-height: 62px;
  overflow-y: auto;
}

.section-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ts-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mini-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.ts-result {
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  font-size: 11.5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.jwt-input {
  height: 66px;
}

.jwt-split {
  gap: 10px;
  min-height: 190px;
}

.jwt-pre {
  margin: 0;
  padding: 8px 10px;
  flex: 1;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  background: var(--bg-panel);
}

.verify-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toggle-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.proto-diff-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  font-size: 12px;
}

.pdiff-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--border);
}

.pdiff-cell {
  display: flex;
  gap: 8px;
  padding: 2px 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.pdiff-cell:first-child {
  border-right: 1px solid var(--border);
}

.pdiff-ln {
  width: 24px;
  text-align: right;
  color: var(--text-muted);
  flex-shrink: 0;
}

.prow-modified .pdiff-cell {
  background: var(--diff-mod-bg);
  color: var(--diff-mod-text);
}

.prow-added .pdiff-cell:last-child {
  background: var(--diff-add-bg);
  color: var(--diff-add-text);
}

.prow-removed .pdiff-cell:first-child {
  background: var(--diff-del-bg);
  color: var(--diff-del-text);
}

@media (max-width: 640px) {
  .toolbox-layout {
    flex-direction: column;
  }
  .tool-rail {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 6px;
  }
  .rail-btn {
    width: auto;
    white-space: nowrap;
  }
  .split-2,
  .ts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
