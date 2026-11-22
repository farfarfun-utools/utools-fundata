<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import logoUrl from '../utools/logo.png'
import CodeEditorView from './components/CodeEditorView.vue'
import ColumnView from './components/ColumnView.vue'
import DiffView from './components/DiffView.vue'
import HistoryModal from './components/HistoryModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import TableView from './components/TableView.vue'
import ToolboxView from './components/ToolboxView.vue'
import TreeView from './components/TreeView.vue'
import { repairJsonWithAi } from './lib/ai-repair'
import { registerFunJsonAiTools } from './lib/ai-tools'
import {
  DATA_FORMATS,
  detectFormat,
  escapeJsonString,
  formatContent,
  getFormatMeta,
  minifyContent,
  repairJsonLocal,
  sortJsonKeys,
  unescapeJsonString,
  type DataFormat,
  type IndentOption,
} from './lib/formats'
import { t } from './lib/i18n'
import {
  autoTabName,
  createTab,
  loadWorkspace,
  pushTabHistory,
  SAMPLES,
  saveWorkspace,
  type FunJsonSettings,
  type TabHistoryEntry,
  type TabItem,
  type ToolId,
  type ViewMode,
  type WorkspaceState,
} from './lib/storage'

const workspace = ref<WorkspaceState>(loadWorkspace())
const showHistory = ref(false)
const showSettings = ref(false)
const showSampleMenu = ref(false)
const jsonPathOpen = ref(false)
const dragOver = ref(false)
const cursorPos = ref({ line: 1, col: 1 })
const sortOrder = ref<'asc' | 'desc'>('asc')
const escapedState = ref(false)

const renamingTabId = ref<string | null>(null)
const renameDraft = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const codeEditorRef = ref<InstanceType<typeof CodeEditorView> | null>(null)

const toast = ref<{ message: string; kind: 'info' | 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeEnter: (() => void) | null = null

const prefersDark = ref(
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false,
)

const effectiveDark = computed(() => {
  if (workspace.value.settings.theme === 'dark') return true
  if (workspace.value.settings.theme === 'light') return false
  if (typeof window !== 'undefined' && window.utools?.isDarkColors) {
    return Boolean(window.utools.isDarkColors())
  }
  return prefersDark.value
})

const activeTab = computed<TabItem>(() => {
  const found = workspace.value.tabs.find((item) => item.id === workspace.value.activeTabId)
  return found ?? workspace.value.tabs[0]
})

const locale = computed(() => workspace.value.settings.locale)
const inToolbox = computed(() => workspace.value.activeTool !== null)
const currentTool = computed<ToolId>(() => workspace.value.activeTool ?? 'types')
const isJsonLike = computed(() => getFormatMeta(activeTab.value.format).isJsonLike)

const activeStats = computed(() => {
  const text = activeTab.value.content
  const lines = text ? text.split(/\r?\n/).length : 0
  const bytes = new TextEncoder().encode(text).length
  const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
  return { lines, size }
})

function notify(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  toast.value = { message, kind }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 2400)
}

function applyThemeAttribute() {
  if (typeof document === 'undefined') return
  const mode = workspace.value.settings.theme
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.utools?.isDarkColors) {
      document.documentElement.dataset.theme = window.utools.isDarkColors() ? 'dark' : 'light'
    } else {
      delete document.documentElement.dataset.theme
    }
  } else {
    document.documentElement.dataset.theme = mode
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveWorkspace(workspace.value)
  }, 250)
}

watch(
  workspace,
  () => {
    applyThemeAttribute()
    scheduleSave()
  },
  { deep: true },
)

function updateActiveTab(updater: (tab: TabItem) => TabItem) {
  const idx = workspace.value.tabs.findIndex((item) => item.id === activeTab.value.id)
  if (idx === -1) return
  workspace.value.tabs[idx] = updater(workspace.value.tabs[idx])
}

function snapshotActiveTab(label: string) {
  updateActiveTab((tab) => pushTabHistory(tab, label))
}

function setActiveContent(next: string) {
  updateActiveTab((tab) => ({ ...tab, content: next, updatedAt: Date.now() }))
}

function setActiveDiffRight(next: string) {
  updateActiveTab((tab) => ({ ...tab, diffRight: next, updatedAt: Date.now() }))
}

function setActiveFormat(next: DataFormat) {
  updateActiveTab((tab) => ({ ...tab, format: next, updatedAt: Date.now() }))
}

function setActiveIndent(next: IndentOption) {
  updateActiveTab((tab) => ({ ...tab, indent: next, updatedAt: Date.now() }))
}

function openNewTab(opts?: {
  content?: string
  format?: DataFormat
  title?: string
  filename?: string
}) {
  const content = opts?.content ?? ''
  const format = opts?.format ?? (content ? detectFormat(content, opts?.filename) : 'json')
  const title =
    opts?.title ??
    opts?.filename ??
    (content ? autoTabName(content, format, 'Untitled') : `Tab ${workspace.value.tabs.length + 1}`)
  const tab = createTab({
    title,
    format,
    content,
    diffRight: content,
    indent: workspace.value.settings.defaultIndent,
    filename: opts?.filename,
  })
  workspace.value.tabs.push(tab)
  workspace.value.activeTabId = tab.id
  workspace.value.activeTool = null
  showSampleMenu.value = false
}

function closeTab(id: string) {
  if (workspace.value.tabs.length <= 1) {
    updateActiveTab((tab) => ({ ...tab, content: '', title: 'Untitled', updatedAt: Date.now() }))
    return
  }
  const idx = workspace.value.tabs.findIndex((tab) => tab.id === id)
  if (idx === -1) return
  workspace.value.tabs.splice(idx, 1)
  if (workspace.value.activeTabId === id) {
    const nextIdx = Math.max(0, idx - 1)
    workspace.value.activeTabId = workspace.value.tabs[nextIdx].id
  }
}

function startRename(tab: TabItem) {
  renamingTabId.value = tab.id
  renameDraft.value = tab.title
}

function commitRename(tabId: string) {
  const trimmed = renameDraft.value.trim()
  if (trimmed) {
    const target = workspace.value.tabs.find((item) => item.id === tabId)
    if (target) target.title = trimmed.slice(0, 32)
  }
  renamingTabId.value = null
}

function loadSample(kind: keyof typeof SAMPLES) {
  showSampleMenu.value = false
  const content = SAMPLES[kind]
  const format: DataFormat = kind === 'yaml' ? 'yaml' : kind === 'protobuf' ? 'protobuf' : kind === 'jwt' ? 'text' : 'json'
  if (kind === 'jwt') {
    workspace.value.activeTool = 'jwt'
    return
  }
  openNewTab({
    content,
    format,
    title: autoTabName(content, format, `sample.${format}`),
  })
}

// Toolbar actions
function handleFormat() {
  try {
    snapshotActiveTab(t(locale.value, 'action.format'))
    const formatted = formatContent(activeTab.value.content, activeTab.value.format, activeTab.value.indent)
    setActiveContent(formatted)
    notify(locale.value === 'en' ? 'Formatted' : '已格式化', 'success')
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Format failed', 'error')
  }
}

function handleMinify() {
  try {
    snapshotActiveTab(t(locale.value, 'action.minify'))
    const minified = minifyContent(activeTab.value.content, activeTab.value.format)
    setActiveContent(minified)
    notify(locale.value === 'en' ? 'Minified' : '已压缩', 'success')
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Minify failed', 'error')
  }
}

async function handleRepair() {
  try {
    snapshotActiveTab(t(locale.value, 'tool.repair'))
    if (workspace.value.settings.ai.provider === 'local') {
      const res = repairJsonLocal(activeTab.value.content, activeTab.value.indent)
      setActiveContent(res.output)
      notify(locale.value === 'en' ? 'Repaired JSON locally' : '已完成本地 JSON 修复', 'success')
    } else {
      const res = await repairJsonWithAi(activeTab.value.content, {
        ...workspace.value.settings.ai,
        indent: activeTab.value.indent,
      })
      setActiveContent(res.output)
      notify(
        locale.value === 'en' ? `Repaired via ${res.source}` : `已修复（引擎：${res.source}）`,
        'success',
      )
    }
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Repair failed', 'error')
  }
}

function handleSortKeys() {
  try {
    snapshotActiveTab(sortOrder.value === 'asc' ? 'Sort A→Z' : 'Sort Z→A')
    const next = sortJsonKeys(activeTab.value.content, sortOrder.value, activeTab.value.indent)
    setActiveContent(next)
    notify(
      sortOrder.value === 'asc'
        ? t(locale.value, 'action.sortAsc')
        : t(locale.value, 'action.sortDesc'),
      'success',
    )
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Sort failed', 'error')
  }
}

function handleToggleEscape() {
  try {
    snapshotActiveTab(escapedState.value ? 'Unescape' : 'Escape')
    const next = escapedState.value
      ? unescapeJsonString(activeTab.value.content)
      : escapeJsonString(activeTab.value.content)
    setActiveContent(next)
    escapedState.value = !escapedState.value
    notify(
      escapedState.value ? t(locale.value, 'action.escape') : t(locale.value, 'action.unescape'),
      'success',
    )
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Escape toggle failed', 'error')
  }
}

async function handleCopy(text: string) {
  try {
    if (typeof window !== 'undefined' && window.utools?.copyText) {
      window.utools.copyText(text)
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    }
    notify(t(locale.value, 'action.copied'), 'success')
  } catch {
    notify(locale.value === 'en' ? 'Copy failed' : '复制失败', 'error')
  }
}

function handleOpenFile() {
  if (typeof window !== 'undefined' && window.funjson?.openFile) {
    try {
      const file = window.funjson.openFile()
      if (file) {
        const format = detectFormat(file.content, file.name)
        openNewTab({ content: file.content, format, filename: file.name, title: file.name })
        notify(`${locale.value === 'en' ? 'Opened' : '已打开'} ${file.name}`, 'success')
      }
      return
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Open failed', 'error')
      return
    }
  }
  fileInputRef.value?.click()
}

async function handleBrowserFilePick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const content = await file.text()
    const format = detectFormat(content, file.name)
    openNewTab({ content, format, filename: file.name, title: file.name })
    notify(`${locale.value === 'en' ? 'Opened' : '已打开'} ${file.name}`, 'success')
  } catch {
    notify(locale.value === 'en' ? 'Failed to read file' : '读取文件失败', 'error')
  } finally {
    input.value = ''
  }
}

function handleExportFile(payload?: { filename: string; content: string }) {
  const ext = getFormatMeta(activeTab.value.format).ext
  const filename = payload?.filename ?? activeTab.value.filename ?? `${activeTab.value.title || 'funjson'}.${ext}`
  const content = payload?.content ?? activeTab.value.content

  if (typeof window !== 'undefined' && window.funjson?.saveFile) {
    try {
      const saved = window.funjson.saveFile(filename, content)
      if (saved) notify(`${locale.value === 'en' ? 'Exported' : '已导出'} ${filename}`, 'success')
      return
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Export failed', 'error')
      return
    }
  }

  // Browser download fallback
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    notify(`${locale.value === 'en' ? 'Exported' : '已导出'} ${filename}`, 'success')
  } catch {
    notify(locale.value === 'en' ? 'Export failed' : '导出失败', 'error')
  }
}

function handleRestoreHistory(entry: TabHistoryEntry) {
  snapshotActiveTab(locale.value === 'en' ? 'Before Restore' : '恢复前备份')
  updateActiveTab((tab) => ({
    ...tab,
    content: entry.content,
    format: entry.format,
    updatedAt: Date.now(),
  }))
  showHistory.value = false
  notify(locale.value === 'en' ? 'Restored snapshot' : '已恢复历史版本', 'success')
}

function handleApplyFromToolbox(payload: { content: string; format?: DataFormat }) {
  snapshotActiveTab('Toolbox')
  updateActiveTab((tab) => ({
    ...tab,
    content: payload.content,
    format: payload.format ?? tab.format,
    updatedAt: Date.now(),
  }))
  workspace.value.activeTool = null
  notify(locale.value === 'en' ? 'Applied to active tab' : '已写回当前标签', 'success')
}

function cycleTheme() {
  const order: Array<FunJsonSettings['theme']> = ['system', 'light', 'dark']
  const next = order[(order.indexOf(workspace.value.settings.theme) + 1) % order.length]
  workspace.value.settings.theme = next
}

function toggleLocale() {
  workspace.value.settings.locale = workspace.value.settings.locale === 'zh-CN' ? 'en' : 'zh-CN'
}

function switchWorkspace(mode: 'workbench' | 'toolbox') {
  if (mode === 'workbench') {
    workspace.value.activeTool = null
  } else {
    workspace.value.activeTool = workspace.value.activeTool ?? 'types'
  }
}

function setViewMode(mode: ViewMode) {
  workspace.value.activeTool = null
  workspace.value.viewMode = mode
}

function ingestTextPayload(raw: string, preferFormat?: DataFormat, autoFormat = false) {
  const text = raw
  const format = preferFormat ?? detectFormat(text)
  let finalContent = text
  if (autoFormat) {
    try {
      finalContent = formatContent(text, format, workspace.value.settings.defaultIndent)
    } catch {
      finalContent = text
    }
  }
  const title = autoTabName(finalContent, format, 'Clipboard')
  if (activeTab.value.content.trim()) {
    openNewTab({ content: finalContent, format, title })
  } else {
    updateActiveTab((tab) => ({
      ...tab,
      title,
      format,
      content: finalContent,
      diffRight: finalContent,
      updatedAt: Date.now(),
    }))
    workspace.value.activeTool = null
  }
  workspace.value.viewMode = 'code'
}

function handlePluginEnter(action: { code: string; type: string; payload: unknown }) {
  if (!action) return
  if (action.code === 'json-regex' && typeof action.payload === 'string') {
    ingestTextPayload(action.payload, 'json', true)
    return
  }
  if (action.code === 'json-over' && typeof action.payload === 'string') {
    ingestTextPayload(action.payload, undefined, false)
    return
  }
  if (action.code === 'json-files' && Array.isArray(action.payload) && window.funjson?.readEntryFiles) {
    const files = window.funjson.readEntryFiles(action.payload as Array<string | { path?: string }>)
    for (const file of files) {
      const format = detectFormat(file.content, file.name)
      openNewTab({ content: file.content, format, filename: file.name, title: file.name })
    }
    return
  }
  if (action.code === 'funjson') {
    workspace.value.activeTool = null
  }
}

async function handleDrop(event: DragEvent) {
  dragOver.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  for (const file of Array.from(files).slice(0, 5)) {
    try {
      const content = await file.text()
      const format = detectFormat(content, file.name)
      openNewTab({ content, format, filename: file.name, title: file.name })
    } catch {
      // ignore unreadable dropped file
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return
  const key = event.key.toLowerCase()
  if (event.shiftKey && key === 'f') {
    event.preventDefault()
    if (!inToolbox.value) handleFormat()
  } else if (key === 'k') {
    event.preventDefault()
    workspace.value.activeTool = null
    workspace.value.viewMode = 'code'
    jsonPathOpen.value = true
    nextTick(() => codeEditorRef.value?.focusJsonPath())
  } else if (key === 't') {
    event.preventDefault()
    openNewTab()
  }
}

let mediaQuery: MediaQueryList | null = null
const onMediaChange = (e: MediaQueryListEvent) => {
  prefersDark.value = e.matches
}

onMounted(() => {
  applyThemeAttribute()
  registerFunJsonAiTools()

  if (typeof window !== 'undefined' && window.funjson?.onEnter) {
    unsubscribeEnter = window.funjson.onEnter(handlePluginEnter)
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener?.('change', onMediaChange)
  }
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  unsubscribeEnter?.()
  mediaQuery?.removeEventListener?.('change', onMediaChange)
  window.removeEventListener('keydown', handleKeydown)
  if (toastTimer) clearTimeout(toastTimer)
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div
    class="workbench-shell"
    :class="{ 'is-dragover': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave.self="dragOver = false"
    @drop.prevent="handleDrop"
  >
    <!-- Top Header & Tab Bar -->
    <header class="top-bar">
      <div class="brand-cluster">
        <img :src="logoUrl" alt="数形万变" class="brand-logo" />
        <span class="brand-name">{{ t(locale, 'app.name') }}</span>
      </div>

      <div class="tabs-strip" role="tablist">
        <div
          v-for="tab in workspace.tabs"
          :key="tab.id"
          class="tab-pill"
          :class="{ active: !inToolbox && tab.id === activeTab.id }"
          role="tab"
          :aria-selected="!inToolbox && tab.id === activeTab.id"
          :data-testid="`tab-${tab.id}`"
          @click="
            workspace.activeTabId = tab.id;
            workspace.activeTool = null;
          "
          @dblclick="startRename(tab)"
        >
          <span class="tab-fmt mono">{{ getFormatMeta(tab.format).shortLabel }}</span>
          <input
            v-if="renamingTabId === tab.id"
            v-model="renameDraft"
            type="text"
            class="tab-rename-input"
            @click.stop
            @blur="commitRename(tab.id)"
            @keydown.enter="commitRename(tab.id)"
            @keydown.esc="renamingTabId = null"
          />
          <span v-else class="tab-title">{{ tab.title }}</span>
          <button
            type="button"
            class="tab-close"
            :aria-label="t(locale, 'action.closeTab')"
            @click.stop="closeTab(tab.id)"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          class="icon-btn new-tab-btn"
          data-testid="new-tab-btn"
          :title="t(locale, 'action.newTab')"
          :aria-label="t(locale, 'action.newTab')"
          @click="openNewTab()"
        >
          +
        </button>

        <div class="sample-wrap">
          <button
            type="button"
            class="pill-btn xs"
            data-testid="sample-menu-btn"
            @click="showSampleMenu = !showSampleMenu"
          >
            {{ locale === 'en' ? 'Samples ▾' : '示例 ▾' }}
          </button>
          <div v-if="showSampleMenu" class="sample-menu">
            <button type="button" class="menu-item" @click="loadSample('json')">JSON (Users & Decoders)</button>
            <button type="button" class="menu-item" @click="loadSample('yaml')">YAML (Gateway Config)</button>
            <button type="button" class="menu-item" @click="loadSample('protobuf')">Protobuf (.proto)</button>
            <button type="button" class="menu-item" @click="loadSample('jwt')">JWT Token</button>
          </div>
        </div>
      </div>

      <div class="top-right-controls">
        <div class="seg-control workspace-switch" role="group">
          <button
            type="button"
            class="seg-btn"
            data-testid="ws-workbench-btn"
            :class="{ active: !inToolbox }"
            @click="switchWorkspace('workbench')"
          >
            {{ locale === 'en' ? 'Workbench' : '工作台' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="ws-toolbox-btn"
            :class="{ active: inToolbox }"
            @click="switchWorkspace('toolbox')"
          >
            {{ locale === 'en' ? 'Toolbox' : '工具箱' }}
          </button>
        </div>

        <button
          type="button"
          class="icon-btn"
          data-testid="history-btn"
          :title="t(locale, 'action.history')"
          :aria-label="t(locale, 'action.history')"
          @click="showHistory = true"
        >
          ◷
        </button>
        <button
          type="button"
          class="icon-btn theme-button"
          data-testid="theme-btn"
          :title="t(locale, 'settings.theme')"
          :aria-label="t(locale, 'settings.theme')"
          @click="cycleTheme"
        >
          {{ effectiveDark ? '☾' : '☀' }}
        </button>
        <button
          type="button"
          class="icon-btn"
          data-testid="settings-btn"
          :title="t(locale, 'action.settings')"
          :aria-label="t(locale, 'action.settings')"
          @click="showSettings = true"
        >
          ⚙
        </button>
      </div>
    </header>

    <!-- Workbench Sub-toolbar -->
    <div v-if="!inToolbox" class="action-bar">
      <div class="seg-control view-switch" role="tablist">
        <button
          v-for="mode in (['code', 'tree', 'columns', 'table', 'diff'] as ViewMode[])"
          :key="mode"
          type="button"
          class="seg-btn"
          :class="{ active: workspace.viewMode === mode }"
          :data-testid="`view-${mode}`"
          @click="setViewMode(mode)"
        >
          {{ t(locale, `nav.${mode}`) }}
        </button>
      </div>

      <div class="action-buttons">
        <button type="button" class="pill-btn primary xs" data-testid="btn-format" @click="handleFormat">
          {{ t(locale, 'action.format') }}
        </button>
        <button type="button" class="pill-btn xs" data-testid="btn-minify" @click="handleMinify">
          {{ t(locale, 'action.minify') }}
        </button>
        <button v-if="isJsonLike" type="button" class="pill-btn xs" data-testid="btn-repair" @click="handleRepair">
          {{ locale === 'en' ? 'Repair' : '修复' }}
        </button>
        <button v-if="isJsonLike" type="button" class="pill-btn xs" data-testid="btn-sort" @click="handleSortKeys">
          {{ locale === 'en' ? 'Sort' : '排序' }}
        </button>
        <button v-if="isJsonLike" type="button" class="pill-btn xs" data-testid="btn-escape" @click="handleToggleEscape">
          {{ escapedState ? t(locale, 'action.unescape') : t(locale, 'action.escape') }}
        </button>
        <button type="button" class="pill-btn xs" @click="handleOpenFile">
          {{ locale === 'en' ? 'Open' : '打开' }}
        </button>
        <button type="button" class="pill-btn xs" @click="handleExportFile()">
          {{ locale === 'en' ? 'Export' : '导出' }}
        </button>
        <button type="button" class="pill-btn xs" @click="handleCopy(activeTab.content)">
          {{ t(locale, 'action.copy') }}
        </button>
      </div>

      <div class="format-controls">
        <select
          class="pill-select compact-select"
          :value="activeTab.format"
          aria-label="Data format"
          @change="setActiveFormat(($event.target as HTMLSelectElement).value as DataFormat)"
        >
          <option v-for="fmt in DATA_FORMATS" :key="fmt.id" :value="fmt.id">{{ fmt.label }}</option>
        </select>

        <select
          class="pill-select compact-select"
          :value="activeTab.indent"
          aria-label="Indentation"
          @change="setActiveIndent(($event.target as HTMLSelectElement).value as IndentOption)"
        >
          <option value="2">2sp</option>
          <option value="4">4sp</option>
          <option value="tab">Tab</option>
        </select>
      </div>
    </div>

    <!-- Main Workspace Pane -->
    <main class="main-pane">
      <ToolboxView
        v-if="inToolbox"
        :active-tool="currentTool"
        :current-content="activeTab.content"
        :current-format="activeTab.format"
        :indent="activeTab.indent"
        :settings="workspace.settings"
        @update:active-tool="workspace.activeTool = $event"
        @apply-to-tab="handleApplyFromToolbox"
        @open-new-tab="openNewTab($event)"
        @copy="handleCopy"
        @export="handleExportFile($event)"
        @notify="notify($event.message, $event.kind)"
      />

      <CodeEditorView
        v-else-if="workspace.viewMode === 'code'"
        ref="codeEditorRef"
        :model-value="activeTab.content"
        :format="activeTab.format"
        :settings="workspace.settings"
        :is-dark="effectiveDark"
        :json-path-open="jsonPathOpen"
        @update:model-value="setActiveContent"
        @update:json-path-open="jsonPathOpen = $event"
        @request-repair="handleRepair"
        @open-new-tab="openNewTab($event)"
        @copy="handleCopy"
        @notify="notify($event.message, $event.kind)"
        @cursor-change="cursorPos = $event"
      />

      <TreeView
        v-else-if="workspace.viewMode === 'tree'"
        :content="activeTab.content"
        :indent="activeTab.indent"
        :settings="workspace.settings"
        @update:content="setActiveContent"
        @request-repair="handleRepair"
        @copy="handleCopy"
      />

      <ColumnView
        v-else-if="workspace.viewMode === 'columns'"
        :content="activeTab.content"
        :settings="workspace.settings"
        @copy="handleCopy"
        @open-new-tab="openNewTab($event)"
        @request-repair="handleRepair"
      />

      <TableView
        v-else-if="workspace.viewMode === 'table'"
        :content="activeTab.content"
        :settings="workspace.settings"
        @copy="handleCopy"
        @export="handleExportFile($event)"
        @request-repair="handleRepair"
      />

      <DiffView
        v-else
        :left="activeTab.content"
        :right="activeTab.diffRight"
        :format="activeTab.format"
        :indent="activeTab.indent"
        :settings="workspace.settings"
        :current-tab-content="activeTab.content"
        @update:left="setActiveContent"
        @update:right="setActiveDiffRight"
        @notify="notify($event.message, $event.kind)"
      />
    </main>

    <!-- Bottom Status Bar -->
    <footer class="status-bar">
      <div class="status-group">
        <span class="status-item mono">{{ getFormatMeta(activeTab.format).label }}</span>
        <span class="status-sep">·</span>
        <span class="status-item tabular">Ln {{ cursorPos.line }}, Col {{ cursorPos.col }}</span>
        <span class="status-sep">·</span>
        <span class="status-item tabular">{{ activeStats.lines }} {{ locale === 'en' ? 'lines' : '行' }} · {{ activeStats.size }}</span>
        <span class="status-sep">·</span>
        <span class="status-item">UTF-8</span>
      </div>

      <div class="status-group">
        <span class="offline-pill">
          <span class="offline-dot" />
          {{ locale === 'en' ? 'Offline' : '完全离线' }}
        </span>
        <button
          type="button"
          class="locale-mini-btn"
          data-testid="locale-toggle-btn"
          @click="toggleLocale"
        >
          {{ locale === 'zh-CN' ? '中 / EN' : 'EN / 中' }}
        </button>
      </div>
    </footer>

    <!-- Hidden browser file picker -->
    <input
      ref="fileInputRef"
      type="file"
      class="sr-only"
      accept=".json,.json5,.jsonc,.yaml,.yml,.toml,.xml,.csv,.tsv,.ini,.ndjson,.jsonl,.proto,.sql,.txt,.md"
      @change="handleBrowserFilePick"
    />

    <!-- Toast Notification -->
    <div v-if="toast" class="toast-banner" :class="`toast-${toast.kind}`" role="status">
      {{ toast.message }}
    </div>

    <!-- Modals -->
    <HistoryModal
      :open="showHistory"
      :entries="activeTab.history"
      :current-content="activeTab.content"
      :locale="locale"
      @close="showHistory = false"
      @restore="handleRestoreHistory"
    />

    <SettingsModal
      :open="showSettings"
      :settings="workspace.settings"
      @close="showSettings = false"
      @update:settings="workspace.settings = $event"
    />
  </div>
</template>

<style scoped>
.workbench-shell {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-canvas);
  position: relative;
}

.workbench-shell.is-dragover::after {
  content: '';
  position: fixed;
  inset: 6px;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-lg);
  background: var(--accent-soft);
  pointer-events: none;
  z-index: 80;
}

.top-bar {
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--hairline);
  min-width: 0;
}

.brand-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.brand-logo {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  object-fit: cover;
}

.brand-name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  white-space: nowrap;
}

.tabs-strip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding: 2px 0;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 27px;
  max-width: 155px;
  padding: 0 7px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: var(--bg-recessed);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 130ms ease;
}

.tab-pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-pill.active {
  background: var(--bg-panel);
  border-color: var(--border-accent);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm), inset 0 -2px 0 var(--accent);
}

.tab-fmt {
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--accent-soft);
  color: var(--accent);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.tab-rename-input {
  width: 82px;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--accent);
  border-radius: 3px;
  background: var(--bg-panel);
  font-size: 11.5px;
  outline: none;
}

.tab-close {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-muted);
}

.tab-close:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.new-tab-btn {
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 600;
}

.sample-wrap {
  position: relative;
  flex-shrink: 0;
}

.sample-menu {
  position: fixed;
  top: 40px;
  z-index: 60;
  min-width: 190px;
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: var(--bg-panel);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  text-align: left;
  font-size: 12px;
  color: var(--text-primary);
}

.menu-item:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

.top-right-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  flex-shrink: 0;
  overflow-x: auto;
  min-width: 0;
}

.action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.format-controls {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.compact-select {
  height: 24px;
  font-size: 11.5px;
}

.main-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.status-bar {
  height: 25px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  overflow: hidden;
}

.status-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.status-sep {
  opacity: 0.45;
}

.offline-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--success);
  font-weight: 500;
}

.offline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.locale-mini-btn {
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 600;
}

.locale-mini-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.toast-banner {
  position: fixed;
  right: 14px;
  bottom: 34px;
  z-index: 100;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-strong);
  background: var(--bg-panel);
  color: var(--text-primary);
}

.toast-success {
  border-color: var(--success);
  color: var(--success);
}

.toast-error {
  border-color: var(--danger);
  color: var(--danger);
}

@media (max-width: 560px) {
  .brand-name {
    display: none;
  }
  .top-bar {
    gap: 4px;
    padding: 0 6px;
  }
  .seg-btn {
    padding: 0 6px;
    font-size: 11px;
  }
}
</style>
