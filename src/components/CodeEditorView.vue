<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { inspectToken, type SmartInspection } from '../lib/decoders'
import { getFormatMeta, parseJsonError, type DataFormat } from '../lib/formats'
import { t } from '../lib/i18n'
import { JSONPATH_EXAMPLES, runJsonPath } from '../lib/jsonpath'
import { renumberProto } from '../lib/proto'
import type { FunJsonSettings } from '../lib/storage'

const props = defineProps<{
  modelValue: string
  format: DataFormat
  settings: FunJsonSettings
  isDark: boolean
  jsonPathOpen: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:jsonPathOpen': [value: boolean]
  'request-repair': []
  'open-new-tab': [payload: { content: string; format: DataFormat; title?: string }]
  copy: [text: string]
  notify: [payload: { message: string; kind?: 'info' | 'success' | 'error' }]
  'cursor-change': [pos: { line: number; col: number }]
}>()

const editorHost = ref<HTMLElement | null>(null)
const jsonPathInputRef = ref<HTMLInputElement | null>(null)
const jsonPathExpr = ref('$.users[*].name')
const inspections = ref<SmartInspection[]>([])

let view: EditorView | null = null
let syncingExternal = false

const langCompartment = new Compartment()
const themeCompartment = new Compartment()
const wrapCompartment = new Compartment()
const fontCompartment = new Compartment()

const lightHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: '#0369a1', fontWeight: '500' },
  { tag: tags.string, color: '#047857' },
  { tag: tags.number, color: '#b45309' },
  { tag: tags.bool, color: '#0e7490', fontWeight: '600' },
  { tag: tags.null, color: '#64748b', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#6d28d9', fontWeight: '600' },
  { tag: tags.comment, color: '#94a3b8', fontStyle: 'italic' },
  { tag: tags.tagName, color: '#0284c7' },
  { tag: tags.attributeName, color: '#7c3aed' },
  { tag: tags.punctuation, color: '#64748b' },
])

const darkHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: '#7dd3fc', fontWeight: '500' },
  { tag: tags.string, color: '#6ee7b7' },
  { tag: tags.number, color: '#fcd34d' },
  { tag: tags.bool, color: '#22d3ee', fontWeight: '600' },
  { tag: tags.null, color: '#94a3b8', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#c4b5fd', fontWeight: '600' },
  { tag: tags.comment, color: '#64748b', fontStyle: 'italic' },
  { tag: tags.tagName, color: '#38bdf8' },
  { tag: tags.attributeName, color: '#c4b5fd' },
  { tag: tags.punctuation, color: '#7f93ad' },
])

function getLanguageExtension(format: DataFormat): Extension {
  switch (format) {
    case 'json':
    case 'jsonc':
    case 'json5':
    case 'ndjson':
      return json()
    case 'yaml':
      return yaml()
    case 'xml':
      return xml()
    case 'html':
      return html()
    case 'css':
      return css()
    case 'sql':
      return sql()
    case 'javascript':
      return javascript()
    case 'typescript':
      return javascript({ typescript: true })
    case 'markdown':
      return markdown()
    default:
      return []
  }
}

function getFontExtension(fontSize: number): Extension {
  return EditorView.theme({
    '&': { fontSize: `${fontSize}px` },
    '.cm-content': { padding: '8px 0' },
  })
}

const isJsonLike = computed(() => getFormatMeta(props.format).isJsonLike)

const docStats = computed(() => {
  const text = props.modelValue
  const lines = text ? text.split(/\r?\n/).length : 0
  const bytes = new TextEncoder().encode(text).length
  const sizeLabel = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
  return { lines, bytes, sizeLabel }
})

const jsonStatus = computed(() => {
  if (!isJsonLike.value) return null
  return parseJsonError(props.modelValue)
})

const jsonPathResult = computed(() => {
  if (!props.jsonPathOpen) return null
  return runJsonPath(props.modelValue, jsonPathExpr.value)
})

function filterInspections(list: SmartInspection[]): SmartInspection[] {
  const cfg = props.settings.smartDisplay
  return list.filter((item) => {
    if (item.kind === 'timestamp') return cfg.timestamp
    if (item.kind === 'color') return cfg.colorSwatch
    if (item.kind === 'base64') return cfg.base64
    if (item.kind === 'json-string') return cfg.embeddedJson
    return true
  })
}

function extractTokenAroundCursor(state: EditorState): string {
  const sel = state.selection.main
  if (sel.from < sel.to && sel.to - sel.from <= 8000) {
    return state.doc.sliceString(sel.from, sel.to)
  }
  const line = state.doc.lineAt(sel.head)
  const text = line.text
  const offset = sel.head - line.from

  // 1. Check if cursor is inside a quoted string on this line
  const quoteRegex = /"(?:\\.|[^"\\])*"/g
  let m: RegExpExecArray | null
  while ((m = quoteRegex.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (offset >= start && offset <= end) {
      return m[0]
    }
  }

  // 2. Check token around cursor
  let left = offset
  let right = offset
  while (left > 0 && !/[\s,[\]{}:;()]/.test(text[left - 1])) left -= 1
  while (right < text.length && !/[\s,[\]{}:;()]/.test(text[right])) right += 1
  const direct = text.slice(left, right).trim()
  if (direct && filterInspections(inspectToken(direct, props.settings.timeZone)).length > 0) {
    return direct
  }

  // 3. Fallback: inspect value side of a "key": value JSON/YAML line
  const colonIdx = text.indexOf(':')
  if (colonIdx !== -1) {
    const valPart = text
      .slice(colonIdx + 1)
      .trim()
      .replace(/,\s*$/, '')
    if (valPart) return valPart
  }
  return direct
}

function refreshInspection(state: EditorState) {
  const token = extractTokenAroundCursor(state)
  if (!token) {
    inspections.value = []
    return
  }
  inspections.value = filterInspections(inspectToken(token, props.settings.timeZone))
}

function handleProtoRenumber() {
  const res = renumberProto(props.modelValue)
  if (res.changes > 0) {
    emit('update:modelValue', res.output)
    emit('notify', {
      message: t(props.settings.locale, 'status.changes', { count: res.changes }),
      kind: 'success',
    })
  } else {
    emit('notify', {
      message: t(props.settings.locale, 'status.noChanges'),
      kind: 'info',
    })
  }
}

function applyJsonPathExample(expr: string) {
  jsonPathExpr.value = expr
}

function openJsonPathInNewTab() {
  if (!jsonPathResult.value || jsonPathResult.value.error) return
  emit('open-new-tab', {
    content: jsonPathResult.value.formatted,
    format: 'json',
    title: `JSONPath (${jsonPathResult.value.count})`,
  })
}

function replaceWithJsonPath() {
  if (!jsonPathResult.value || jsonPathResult.value.error) return
  emit('update:modelValue', jsonPathResult.value.formatted)
  emit('notify', {
    message: props.settings.locale === 'en' ? 'Replaced document with query result' : '已用查询结果替换当前文档',
    kind: 'success',
  })
}

function focusJsonPath() {
  nextTick(() => {
    jsonPathInputRef.value?.focus()
    jsonPathInputRef.value?.select()
  })
}

defineExpose({ focusJsonPath })

onMounted(() => {
  if (!editorHost.value) return
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      foldGutter({
        openText: '▾',
        closedText: '▸',
      }),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      bracketMatching(),
      indentOnInput(),
      history(),
      highlightSelectionMatches(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
      langCompartment.of(getLanguageExtension(props.format)),
      themeCompartment.of(syntaxHighlighting(props.isDark ? darkHighlight : lightHighlight)),
      wrapCompartment.of(props.settings.wordWrap ? EditorView.lineWrapping : []),
      fontCompartment.of(getFontExtension(props.settings.fontSize)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !syncingExternal) {
          emit('update:modelValue', update.state.doc.toString())
        }
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          emit('cursor-change', { line: line.number, col: head - line.from + 1 })
          refreshInspection(update.state)
        }
      }),
    ],
  })

  view = new EditorView({
    state,
    parent: editorHost.value,
  })
  refreshInspection(state)
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(
  () => props.modelValue,
  (nextVal) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === nextVal) return
    syncingExternal = true
    try {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: nextVal },
      })
    } finally {
      syncingExternal = false
    }
    refreshInspection(view.state)
  },
)

watch(
  () => props.format,
  (fmt) => {
    view?.dispatch({
      effects: langCompartment.reconfigure(getLanguageExtension(fmt)),
    })
  },
)

watch(
  () => props.isDark,
  (dark) => {
    view?.dispatch({
      effects: themeCompartment.reconfigure(syntaxHighlighting(dark ? darkHighlight : lightHighlight)),
    })
  },
)

watch(
  () => props.settings.wordWrap,
  (wrap) => {
    view?.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
    })
  },
)

watch(
  () => props.settings.fontSize,
  (size) => {
    view?.dispatch({
      effects: fontCompartment.reconfigure(getFontExtension(size)),
    })
  },
)

watch(
  () => [props.settings.timeZone, props.settings.smartDisplay],
  () => {
    if (view) refreshInspection(view.state)
  },
  { deep: true },
)

watch(
  () => props.jsonPathOpen,
  (open) => {
    if (open) focusJsonPath()
  },
)
</script>

<template>
  <div class="code-view">
    <!-- Validation & Quick Context Strip -->
    <div class="editor-status-strip">
      <div class="status-left">
        <template v-if="jsonStatus">
          <span v-if="jsonStatus.valid" class="badge badge-success status-pill">
            ✓ {{ settings.locale === 'en' ? 'Valid JSON' : '合法 JSON' }} · {{ docStats.lines }}
            {{ settings.locale === 'en' ? 'lines' : '行' }} · {{ docStats.sizeLabel }}
          </span>
          <template v-else>
            <span class="badge badge-danger status-pill" :title="jsonStatus.message">
              ✗
              {{
                t(settings.locale, 'status.lineCol', {
                  line: jsonStatus.line ?? 1,
                  column: jsonStatus.column ?? 1,
                })
              }}: {{ jsonStatus.message }}
            </span>
            <button
              type="button"
              class="pill-btn soft xs"
              data-testid="inline-repair-btn"
              @click="emit('request-repair')"
            >
              {{ settings.locale === 'en' ? 'Auto Repair' : '一键修复' }}
            </button>
          </template>
        </template>
        <span v-else class="badge badge-neutral status-pill">
          {{ getFormatMeta(format).label }} · {{ docStats.lines }}
          {{ settings.locale === 'en' ? 'lines' : '行' }} · {{ docStats.sizeLabel }}
        </span>

        <button
          v-if="format === 'protobuf'"
          type="button"
          class="pill-btn primary xs"
          data-testid="proto-renumber-inline"
          @click="handleProtoRenumber"
        >
          {{ settings.locale === 'en' ? 'Renumber Protobuf Fields' : '重排 Protobuf 编号' }}
        </button>
      </div>

      <div class="status-right">
        <button
          v-if="isJsonLike"
          type="button"
          class="pill-btn xs"
          :class="{ soft: jsonPathOpen }"
          data-testid="toggle-jsonpath-btn"
          @click="emit('update:jsonPathOpen', !jsonPathOpen)"
        >
          <span>JSONPath</span>
          <span class="kbd-hint">⌘K</span>
        </button>
      </div>
    </div>

    <!-- Smart Inspector Strip -->
    <div v-if="inspections.length > 0" class="smart-inspector-strip" data-testid="smart-inspector">
      <div v-for="(item, idx) in inspections" :key="`${item.kind}-${idx}`" class="inspector-chip">
        <span class="badge badge-accent">{{ item.label }}</span>
        <span
          v-if="item.previewColor"
          class="color-swatch"
          :style="{ backgroundColor: item.previewColor }"
        />
        <span class="inspector-value mono" :title="item.value">{{ item.value }}</span>
        <span v-if="item.detail" class="inspector-detail tabular">{{ item.detail }}</span>
        <button type="button" class="pill-btn xs" @click="emit('copy', item.value)">
          {{ t(settings.locale, 'action.copy') }}
        </button>
        <button
          v-if="item.kind === 'json-string'"
          type="button"
          class="pill-btn soft xs"
          @click="
            emit('open-new-tab', {
              content: item.value,
              format: 'json',
              title: 'Embedded JSON',
            })
          "
        >
          {{ settings.locale === 'en' ? 'Open in Tab' : '新标签打开' }}
        </button>
      </div>
    </div>

    <!-- CodeMirror 6 Host -->
    <div ref="editorHost" class="cm-studio-host" data-testid="code-editor-host" />

    <!-- Collapsible Bottom JSONPath Query Bar -->
    <div v-if="jsonPathOpen && isJsonLike" class="jsonpath-drawer" data-testid="jsonpath-drawer">
      <div class="jsonpath-top">
        <span class="badge badge-accent">JSONPath</span>
        <input
          id="jsonpath-input"
          ref="jsonPathInputRef"
          v-model="jsonPathExpr"
          type="text"
          class="field-input mono jsonpath-input"
          placeholder="$.users[*].name"
          aria-label="JSONPath expression"
        />
        <span
          v-if="jsonPathResult && !jsonPathResult.error"
          class="badge badge-success"
          data-testid="jsonpath-count"
        >
          {{ t(settings.locale, 'status.matches', { count: jsonPathResult.count }) }}
        </span>
        <span v-else-if="jsonPathResult?.error" class="badge badge-danger" :title="jsonPathResult.error">
          {{ jsonPathResult.error }}
        </span>
        <button
          type="button"
          class="pill-btn xs"
          :disabled="!jsonPathResult || Boolean(jsonPathResult.error)"
          @click="jsonPathResult && emit('copy', jsonPathResult.formatted)"
        >
          {{ t(settings.locale, 'action.copy') }}
        </button>
        <button
          type="button"
          class="pill-btn xs"
          :disabled="!jsonPathResult || Boolean(jsonPathResult.error)"
          @click="openJsonPathInNewTab"
        >
          {{ settings.locale === 'en' ? 'New Tab' : '新标签' }}
        </button>
        <button
          type="button"
          class="pill-btn soft xs"
          :disabled="!jsonPathResult || Boolean(jsonPathResult.error)"
          @click="replaceWithJsonPath"
        >
          {{ settings.locale === 'en' ? 'Replace' : '替换当前' }}
        </button>
        <button
          type="button"
          class="icon-btn"
          :aria-label="settings.locale === 'en' ? 'Close JSONPath' : '关闭 JSONPath'"
          @click="emit('update:jsonPathOpen', false)"
        >
          ✕
        </button>
      </div>

      <div class="jsonpath-chips">
        <button
          v-for="ex in JSONPATH_EXAMPLES"
          :key="ex.id"
          type="button"
          class="chip-btn"
          :class="{ active: jsonPathExpr === ex.expression }"
          :title="settings.locale === 'en' ? ex.descEn : ex.descZh"
          @click="applyJsonPathExample(ex.expression)"
        >
          {{ settings.locale === 'en' ? ex.titleEn : ex.titleZh }}
        </button>
      </div>

      <pre
        v-if="jsonPathResult && !jsonPathResult.error"
        class="jsonpath-preview mono"
        data-testid="jsonpath-output"
      >{{ jsonPathResult.formatted }}</pre>
    </div>
  </div>
</template>

<style scoped>
.code-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-panel);
}

.editor-status-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  flex-shrink: 0;
  min-width: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.status-pill {
  max-width: 440px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kbd-hint {
  font-size: 10px;
  opacity: 0.7;
  padding: 0 3px;
  border-radius: 3px;
  background: var(--bg-recessed);
}

.smart-inspector-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-active);
  flex-shrink: 0;
}

.inspector-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.inspector-value {
  font-size: 12px;
  color: var(--text-primary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-detail {
  font-size: 11px;
  color: var(--text-secondary);
}

.jsonpath-drawer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-strong);
  background: var(--bg-subtle);
  flex-shrink: 0;
}

.jsonpath-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.jsonpath-input {
  flex: 1;
  min-width: 140px;
  height: 26px;
}

.jsonpath-chips {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.jsonpath-preview {
  margin: 0;
  padding: 7px 10px;
  max-height: 112px;
  overflow: auto;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-primary);
}
</style>
