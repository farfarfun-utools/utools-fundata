<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
} from 'vue'
import logoUrl from '../utools/logo.png'
import AppIcon, { type IconName } from './components/AppIcon.vue'
import CommandPalette from './components/CommandPalette.vue'
import SettingsModal from './components/SettingsModal.vue'
import BytesTool from './components/tools/BytesTool.vue'
import ColorTool from './components/tools/ColorTool.vue'
import ConvertTool from './components/tools/ConvertTool.vue'
import CronTool from './components/tools/CronTool.vue'
import EncodingTool from './components/tools/EncodingTool.vue'
import HashTool from './components/tools/HashTool.vue'
import IdGenTool from './components/tools/IdGenTool.vue'
import JwtTool from './components/tools/JwtTool.vue'
import ProtoTool from './components/tools/ProtoTool.vue'
import RadixTool from './components/tools/RadixTool.vue'
import RegexTool from './components/tools/RegexTool.vue'
import SqlTool from './components/tools/SqlTool.vue'
import TextBatchTool from './components/tools/TextBatchTool.vue'
import TextDiffTool from './components/tools/TextDiffTool.vue'
import TimestampTool from './components/tools/TimestampTool.vue'
import { registerFunDataAiTools } from './lib/ai-tools'
import { t } from './lib/i18n'
import {
  detectRouteForInput,
  getToolMeta,
  loadStudioState,
  saveStudioState,
  TOOL_CATEGORIES,
  TOOL_REGISTRY,
  type ActiveView,
  type FunDataSettings,
  type StudioState,
  type ToolCategory,
  type ToolId,
} from './lib/storage'

interface ToolComponentApi {
  loadSample?: () => void
  applyInput?: (text: string) => void
  getExportPayload?: () => { filename: string; content: string }
}

const TOOL_COMPONENTS: Record<ToolId, Component> = {
  convert: ConvertTool,
  sql: SqlTool,
  proto: ProtoTool,
  encoding: EncodingTool,
  jwt: JwtTool,
  hash: HashTool,
  idgen: IdGenTool,
  timestamp: TimestampTool,
  cron: CronTool,
  regex: RegexTool,
  color: ColorTool,
  radix: RadixTool,
  bytes: BytesTool,
  diff: TextDiffTool,
  textbatch: TextBatchTool,
}

const studio = ref<StudioState>(loadStudioState())
const sidebarCollapsed = ref(false)
const mobileNavOpen = ref(false)
const showSettings = ref(false)
const showCmdPalette = ref(false)
const overviewQuery = ref('')
const overviewCategory = ref<'all' | ToolCategory>('all')
const liveMetrics = ref('')
const dragOver = ref(false)

const activeToolRef = ref<ToolComponentApi | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const toast = ref<{ message: string; kind: 'info' | 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeEnter: (() => void) | null = null

const locale = computed(() => studio.value.settings.locale)
const isEn = computed(() => locale.value === 'en')
const isOverview = computed(() => studio.value.activeView === 'overview')

const activeToolId = computed<ToolId | null>(() =>
  studio.value.activeView === 'overview' ? null : studio.value.activeView,
)

const activeToolMeta = computed(() =>
  activeToolId.value ? getToolMeta(activeToolId.value) : null,
)

const activeCategoryLabel = computed(() => {
  if (!activeToolMeta.value) return ''
  const cat = TOOL_CATEGORIES.find((c) => c.id === activeToolMeta.value?.category)
  if (!cat) return ''
  return isEn.value ? cat.labelEn : cat.labelZh
})

const activeToolComponent = computed(() =>
  activeToolId.value ? TOOL_COMPONENTS[activeToolId.value] : null,
)

const themeIcon = computed<IconName>(() => {
  const mode = studio.value.settings.theme
  if (mode === 'system') return 'monitor'
  return mode === 'dark' ? 'moon' : 'sun'
})

const groupedTools = computed(() =>
  TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    label: isEn.value ? cat.labelEn : cat.labelZh,
    tools: TOOL_REGISTRY.filter((item) => item.category === cat.id),
  })),
)

const filteredOverviewTools = computed(() => {
  const q = overviewQuery.value.trim().toLowerCase()
  return TOOL_REGISTRY.filter((tool) => {
    if (overviewCategory.value !== 'all' && tool.category !== overviewCategory.value) {
      return false
    }
    if (!q) return true
    const hay = [
      tool.id,
      tool.nameZh,
      tool.nameEn,
      tool.shortZh,
      tool.shortEn,
      tool.descZh,
      tool.descEn,
      ...tool.tags,
      ...tool.keywords,
    ]
      .join(' ')
      .toLowerCase()
    return q.split(/\s+/).every((tok) => hay.includes(tok))
  })
})

function notify(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  toast.value = { message, kind }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 2200)
}

function applyThemeAndTypography() {
  if (typeof document === 'undefined') return
  const mode = studio.value.settings.theme
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.utools?.isDarkColors) {
      document.documentElement.dataset.theme = window.utools.isDarkColors() ? 'dark' : 'light'
    } else {
      delete document.documentElement.dataset.theme
    }
  } else {
    document.documentElement.dataset.theme = mode
  }
  document.documentElement.style.setProperty(
    '--editor-font-size',
    `${studio.value.settings.fontSize}px`,
  )
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveStudioState(studio.value)
  }, 200)
}

watch(
  studio,
  () => {
    applyThemeAndTypography()
    scheduleSave()
  },
  { deep: true },
)

function selectView(view: ActiveView) {
  studio.value.activeView = view
  mobileNavOpen.value = false
  if (view === 'overview') {
    liveMetrics.value = ''
  }
}

function cycleTheme() {
  const order: FunDataSettings['theme'][] = ['system', 'light', 'dark']
  const idx = order.indexOf(studio.value.settings.theme)
  studio.value.settings.theme = order[(idx + 1) % order.length]
}

function toggleLocale() {
  studio.value.settings.locale = studio.value.settings.locale === 'zh-CN' ? 'en' : 'zh-CN'
}

function updateSettings(next: FunDataSettings) {
  studio.value.settings = next
}

async function copyText(text: string) {
  if (!text) return
  try {
    if (typeof window !== 'undefined' && window.utools?.copyText) {
      window.utools.copyText(text)
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    }
    notify(t(locale.value, 'action.copied'), 'success')
  } catch {
    notify(isEn.value ? 'Copy failed' : '复制失败', 'error')
  }
}

function exportFile(payload: { filename: string; content: string }) {
  if (!payload.content) return
  try {
    if (typeof window !== 'undefined' && window.fundata?.saveFile) {
      const ok = window.fundata.saveFile(payload.filename, payload.content)
      if (ok) notify(isEn.value ? `Exported ${payload.filename}` : `已导出 ${payload.filename}`, 'success')
      return
    }
    const blob = new Blob([payload.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = payload.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    notify(isEn.value ? `Exported ${payload.filename}` : `已导出 ${payload.filename}`, 'success')
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Export failed', 'error')
  }
}

function routeAndLoadContent(content: string, filename?: string, explicitTool?: ToolId) {
  const decision = explicitTool
    ? { tool: explicitTool, payload: content }
    : detectRouteForInput(content, filename)
  studio.value.activeView = decision.tool
  mobileNavOpen.value = false
  nextTick(() => {
    activeToolRef.value?.applyInput?.(decision.payload)
  })
}

function handleLoadSample() {
  activeToolRef.value?.loadSample?.()
  notify(isEn.value ? 'Sample loaded' : '已载入示例', 'info')
}

function handleExportActive() {
  const payload = activeToolRef.value?.getExportPayload?.()
  if (payload && payload.content) {
    exportFile(payload)
  }
}

function triggerOpenFile() {
  if (typeof window !== 'undefined' && window.fundata?.openFile) {
    try {
      const picked = window.fundata.openFile()
      if (picked) {
        routeAndLoadContent(picked.content, picked.name, activeToolId.value ?? undefined)
        notify(isEn.value ? `Opened ${picked.name}` : `已打开 ${picked.name}`, 'success')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to open file', 'error')
    }
    return
  }
  fileInputRef.value?.click()
}

function handleBrowserFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const content = typeof reader.result === 'string' ? reader.result : ''
    routeAndLoadContent(content, file.name, activeToolId.value ?? undefined)
    notify(isEn.value ? `Opened ${file.name}` : `已打开 ${file.name}`, 'success')
  }
  reader.readAsText(file)
  input.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const content = typeof reader.result === 'string' ? reader.result : ''
    routeAndLoadContent(content, file.name)
    notify(isEn.value ? `Loaded ${file.name}` : `已载入 ${file.name}`, 'success')
  }
  reader.readAsText(file)
}

function handleUtoolsEnter(action: { code: string; type: string; payload: unknown }) {
  if (!action) return
  const { code, type, payload } = action

  if (code === 'data-files' && Array.isArray(payload) && window.fundata?.readEntryFiles) {
    const files = window.fundata.readEntryFiles(payload as Array<string | { path?: string }>)
    if (files.length > 0) {
      routeAndLoadContent(files[0].content, files[0].name)
    }
    return
  }

  if (code === 'data-over' && typeof payload === 'string' && payload.trim()) {
    routeAndLoadContent(payload)
    return
  }

  const featureDefaultTool: Record<string, ToolId> = {
    'fundata-convert': 'convert',
    'fundata-sql': 'sql',
    'fundata-encode': 'encoding',
    'fundata-crypto': 'hash',
    'fundata-regex': 'regex',
  }

  if (type === 'text' && typeof payload === 'string') {
    const kw = payload.trim().toLowerCase()
    const directMap: Record<string, ToolId> = {
      yaml: 'convert',
      toml: 'convert',
      xml: 'convert',
      csv: 'convert',
      ini: 'convert',
      数据转换: 'convert',
      格式转换: 'convert',
      sql: 'sql',
      sql格式化: 'sql',
      protobuf: 'proto',
      base64: 'encoding',
      编解码: 'encoding',
      时间戳: 'timestamp',
      jwt: 'jwt',
      hash: 'hash',
      md5: 'hash',
      sha256: 'hash',
      uuid: 'idgen',
      regex: 'regex',
      正则: 'regex',
      cron: 'cron',
      颜色: 'color',
      进制: 'radix',
      字节: 'bytes',
      文本对比: 'diff',
      文本批处理: 'textbatch',
    }
    if (directMap[kw]) {
      selectView(directMap[kw])
      return
    }
  }

  if (featureDefaultTool[code]) {
    selectView(featureDefaultTool[code])
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    showCmdPalette.value = !showCmdPalette.value
    return
  }
  if (event.key === 'Escape') {
    if (showCmdPalette.value) showCmdPalette.value = false
    else if (showSettings.value) showSettings.value = false
    else if (mobileNavOpen.value) mobileNavOpen.value = false
  }
}

onMounted(() => {
  applyThemeAndTypography()
  registerFunDataAiTools()
  window.addEventListener('keydown', handleGlobalKeydown)
  if (window.fundata?.onEnter) {
    unsubscribeEnter = window.fundata.onEnter(handleUtoolsEnter)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (unsubscribeEnter) unsubscribeEnter()
  if (toastTimer) clearTimeout(toastTimer)
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div
    class="studio-shell"
    :class="{ 'is-collapsed': sidebarCollapsed, 'is-drag-over': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave.self="dragOver = false"
    @drop="handleDrop"
  >
    <!-- Mobile backdrop -->
    <div
      v-if="mobileNavOpen"
      class="mobile-nav-backdrop"
      @click="mobileNavOpen = false"
    />

    <!-- Left Collapsible Sidebar -->
    <aside
      class="workbench-nav"
      :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileNavOpen }"
      aria-label="Tools Navigation"
    >
      <!-- Brand Row -->
      <div class="nav-brand-row">
        <button
          type="button"
          class="brand-home-btn"
          :title="t(locale, 'app.name')"
          @click="selectView('overview')"
        >
          <img :src="logoUrl" alt="FunData" class="brand-logo" />
          <span v-if="!sidebarCollapsed" class="brand-titles">
            <span class="brand-name">{{ t(locale, 'app.name') }}</span>
            <span class="brand-sub">{{ t(locale, 'app.subtitle') }}</span>
          </span>
        </button>

        <button
          type="button"
          class="icon-btn collapse-btn"
          data-testid="sidebar-collapse-btn"
          :title="sidebarCollapsed ? (isEn ? 'Expand' : '展开侧栏') : (isEn ? 'Collapse' : '收起侧栏')"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <AppIcon name="panel-left" :size="14" />
        </button>
      </div>

      <!-- Navigation List -->
      <nav class="nav-scroll">
        <button
          type="button"
          class="nav-item nav-overview-item"
          data-testid="nav-overview"
          :class="{ active: isOverview }"
          :aria-current="isOverview ? 'page' : undefined"
          :title="t(locale, 'nav.overview')"
          @click="selectView('overview')"
        >
          <span class="tone-badge nav-ico-badge tone-violet">
            <AppIcon name="grid" :size="13" />
          </span>
          <span v-if="!sidebarCollapsed" class="nav-label">{{ t(locale, 'nav.overview') }}</span>
          <span v-if="!sidebarCollapsed && isOverview" class="active-dot" />
        </button>

        <div v-for="group in groupedTools" :key="group.id" class="nav-group">
          <div v-if="!sidebarCollapsed" class="nav-group-label">{{ group.label }}</div>
          <div v-else class="nav-group-sep" />

          <button
            v-for="tool in group.tools"
            :key="tool.id"
            type="button"
            class="nav-item"
            :data-testid="`nav-tool-${tool.id}`"
            :class="{ active: studio.activeView === tool.id }"
            :aria-current="studio.activeView === tool.id ? 'page' : undefined"
            :title="isEn ? tool.nameEn : tool.nameZh"
            @click="selectView(tool.id)"
          >
            <span class="tone-badge nav-ico-badge" :class="`tone-${tool.tone}`">
              <AppIcon :name="tool.icon" :size="13" />
            </span>
            <span v-if="!sidebarCollapsed" class="nav-label">
              {{ isEn ? tool.shortEn : tool.shortZh }}
            </span>
            <span v-if="!sidebarCollapsed && studio.activeView === tool.id" class="active-dot" />
          </button>
        </div>
      </nav>

      <!-- Bottom Utility Bar -->
      <div class="nav-footer">
        <button
          type="button"
          class="icon-btn"
          data-testid="theme-btn"
          :title="isEn ? `Theme: ${studio.settings.theme}` : `主题：${studio.settings.theme}`"
          @click="cycleTheme"
        >
          <AppIcon :name="themeIcon" :size="14" />
        </button>

        <button
          v-if="!sidebarCollapsed"
          type="button"
          class="ghost-btn xs locale-toggle-btn"
          data-testid="locale-btn"
          :title="isEn ? 'Switch Language' : '切换中/英文'"
          @click="toggleLocale"
        >
          {{ locale === 'zh-CN' ? '中/EN' : 'EN/中' }}
        </button>

        <button
          type="button"
          class="icon-btn"
          data-testid="settings-btn"
          :title="t(locale, 'action.settings')"
          @click="showSettings = true"
        >
          <AppIcon name="settings" :size="14" />
        </button>
      </div>
    </aside>

    <!-- Right Workspace Frame -->
    <div class="workspace-frame">
      <!-- Slim Top Context Header (40px) -->
      <header class="context-header">
        <div class="header-left">
          <button
            type="button"
            class="icon-btn mobile-menu-btn"
            aria-label="Open menu"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <AppIcon name="panel-left" :size="15" />
          </button>

          <button
            v-if="!isOverview"
            type="button"
            class="icon-btn"
            data-testid="back-overview-btn"
            :title="t(locale, 'action.backOverview')"
            @click="selectView('overview')"
          >
            <AppIcon name="arrow-left" :size="14" />
          </button>

          <template v-if="isOverview">
            <span class="header-title">{{ t(locale, 'status.allTools') }}</span>
            <span class="badge badge-accent">{{ t(locale, 'status.offline') }}</span>
          </template>
          <template v-else-if="activeToolMeta">
            <span class="tone-badge header-tool-ico" :class="`tone-${activeToolMeta.tone}`">
              <AppIcon :name="activeToolMeta.icon" :size="13" />
            </span>
            <span class="header-title" data-testid="active-tool-title">
              {{ isEn ? activeToolMeta.nameEn : activeToolMeta.nameZh }}
            </span>
            <span class="badge badge-neutral header-cat-badge">{{ activeCategoryLabel }}</span>
          </template>
        </div>

        <div class="header-right">
          <button
            v-if="!isOverview"
            type="button"
            class="ghost-btn xs"
            data-testid="header-sample-btn"
            @click="handleLoadSample"
          >
            <AppIcon name="sparkles" :size="13" />
            <span class="btn-text">{{ t(locale, 'action.sample') }}</span>
          </button>

          <button
            type="button"
            class="ghost-btn xs"
            data-testid="header-open-btn"
            @click="triggerOpenFile"
          >
            <AppIcon name="upload" :size="13" />
            <span class="btn-text">{{ t(locale, 'action.open') }}</span>
          </button>

          <button
            v-if="!isOverview"
            type="button"
            class="ghost-btn xs"
            data-testid="header-export-btn"
            @click="handleExportActive"
          >
            <AppIcon name="download" :size="13" />
            <span class="btn-text">{{ t(locale, 'action.export') }}</span>
          </button>

          <button
            type="button"
            class="cmd-trigger-btn"
            data-testid="cmd-palette-btn"
            @click="showCmdPalette = true"
          >
            <AppIcon name="search" :size="12" />
            <span class="cmd-trigger-label">{{ t(locale, 'action.quickJump') }}</span>
            <kbd class="cmd-kbd">⌘K</kbd>
          </button>
        </div>
      </header>

      <!-- Main Content Pane -->
      <main class="main-pane">
        <!-- Overview Tool Card Grid -->
        <div v-if="isOverview" class="overview-pane" data-testid="overview-view">
          <div class="overview-filter-bar">
            <div class="overview-search-wrap">
              <AppIcon name="search" :size="13" class="overview-search-ico" />
              <input
                v-model="overviewQuery"
                type="text"
                class="overview-search-input"
                data-testid="overview-search-input"
                :placeholder="isEn ? 'Filter tools by name or format...' : '搜索工具名称、格式或关键词...'"
              />
              <button
                v-if="overviewQuery"
                type="button"
                class="icon-btn"
                @click="overviewQuery = ''"
              >
                <AppIcon name="x" :size="12" />
              </button>
            </div>

            <div class="overview-cats">
              <button
                type="button"
                class="chip-btn"
                data-testid="cat-chip-all"
                :class="{ active: overviewCategory === 'all' }"
                @click="overviewCategory = 'all'"
              >
                {{ t(locale, 'cat.all') }}
              </button>
              <button
                v-for="cat in TOOL_CATEGORIES"
                :key="cat.id"
                type="button"
                class="chip-btn"
                :data-testid="`cat-chip-${cat.id}`"
                :class="{ active: overviewCategory === cat.id }"
                @click="overviewCategory = cat.id"
              >
                {{ isEn ? cat.labelEn : cat.labelZh }}
              </button>
            </div>
          </div>

          <div class="overview-grid-scroll">
            <div class="overview-grid" data-testid="overview-grid">
              <button
                v-for="tool in filteredOverviewTools"
                :key="tool.id"
                type="button"
                class="tool-card"
                :data-testid="`tool-card-${tool.id}`"
                @click="selectView(tool.id)"
              >
                <div class="tool-card-top">
                  <span class="tone-badge card-ico-badge" :class="`tone-${tool.tone}`">
                    <AppIcon :name="tool.icon" :size="16" />
                  </span>
                  <div class="tool-card-headings">
                    <span class="tool-card-title">{{ isEn ? tool.nameEn : tool.nameZh }}</span>
                    <div class="tool-card-tags">
                      <span v-for="tag in tool.tags" :key="tag" class="mini-tag">{{ tag }}</span>
                    </div>
                  </div>
                  <AppIcon name="chevron-right" :size="14" class="card-arrow" />
                </div>
                <p class="tool-card-desc">{{ isEn ? tool.descEn : tool.descZh }}</p>
              </button>
            </div>

            <div v-if="filteredOverviewTools.length === 0" class="overview-empty">
              {{ isEn ? 'No matching data tools found' : '没有匹配的工具，试试其他关键词' }}
            </div>
          </div>
        </div>

        <!-- Active Tool Workspace (preserved across switches) -->
        <KeepAlive v-else>
          <component
            :is="activeToolComponent"
            :key="activeToolId"
            ref="activeToolRef"
            :settings="studio.settings"
            @copy="copyText"
            @export="exportFile"
            @metrics="(m: string) => (liveMetrics = m)"
          />
        </KeepAlive>
      </main>

      <!-- Slim Bottom Status Bar (26px) -->
      <footer class="status-bar">
        <div class="status-left">
          <span class="status-tool-name">
            {{
              isOverview
                ? `${t(locale, 'app.name')} · ${t(locale, 'app.tagline')}`
                : isEn
                  ? activeToolMeta?.nameEn
                  : activeToolMeta?.nameZh
            }}
          </span>
          <span v-if="!isOverview && liveMetrics" class="status-sep">·</span>
          <span v-if="!isOverview && liveMetrics" class="status-metrics mono tabular">
            {{ liveMetrics }}
          </span>
        </div>

        <div class="status-right">
          <span class="offline-indicator">
            <span class="offline-dot" />
            {{ t(locale, 'status.offline') }}
          </span>
        </div>
      </footer>
    </div>

    <!-- Hidden file input fallback -->
    <input
      ref="fileInputRef"
      type="file"
      class="sr-only"
      accept=".json,.json5,.yaml,.yml,.toml,.xml,.csv,.tsv,.ini,.ndjson,.jsonl,.proto,.sql,.txt"
      @change="handleBrowserFileChange"
    />

    <!-- Command Palette (Ctrl/Cmd + K) -->
    <CommandPalette
      :open="showCmdPalette"
      :locale="locale"
      @close="showCmdPalette = false"
      @select="selectView"
    />

    <!-- Settings Modal -->
    <SettingsModal
      :open="showSettings"
      :settings="studio.settings"
      @close="showSettings = false"
      @update:settings="updateSettings"
    />

    <!-- Toast Notification -->
    <Transition name="toast-fade">
      <div v-if="toast" class="studio-toast" :class="`toast-${toast.kind}`">
        <AppIcon
          :name="toast.kind === 'error' ? 'alert-circle' : 'check'"
          :size="13"
        />
        <span>{{ toast.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.studio-shell {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  background: var(--bg-canvas);
  position: relative;
}

.studio-shell.is-drag-over::after {
  content: '';
  position: fixed;
  inset: 6px;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-lg);
  background: rgba(109, 74, 255, 0.06);
  pointer-events: none;
  z-index: 80;
}

/* Left Sidebar */
.workbench-nav {
  width: 166px;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  transition: width 160ms ease;
  user-select: none;
  z-index: 30;
}

.workbench-nav.collapsed {
  width: 50px;
}

.nav-brand-row {
  height: 40px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.workbench-nav.collapsed .nav-brand-row {
  justify-content: center;
  padding: 0 4px;
}

.workbench-nav.collapsed .brand-home-btn {
  display: none;
}

.brand-home-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  text-align: left;
}

.brand-logo {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.brand-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}

.brand-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.brand-sub {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
}

.nav-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 7px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group-label {
  padding: 2px 6px 3px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.nav-group-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}

.nav-item {
  width: 100%;
  height: 31px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  transition: background-color 120ms ease, color 120ms ease;
}

.workbench-nav.collapsed .nav-item {
  justify-content: center;
  padding: 0;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--bg-active);
  color: var(--accent);
  font-weight: 600;
}

.nav-ico-badge {
  width: 22px;
  height: 22px;
  border-radius: 5px;
}

.nav-label {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.nav-footer {
  height: 36px;
  padding: 0 6px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-shrink: 0;
}

.workbench-nav.collapsed .nav-footer {
  flex-direction: column;
  height: auto;
  padding: 6px 0;
  gap: 4px;
}

.locale-toggle-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
}

/* Right Workspace Frame */
.workspace-frame {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.context-header {
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-tool-ico {
  width: 22px;
  height: 22px;
}

.header-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 7px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  transition: border-color 130ms ease, color 130ms ease, background-color 130ms ease;
}

.cmd-trigger-btn:hover {
  border-color: var(--border-accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.cmd-kbd {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

/* Main Content Pane */
.main-pane {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Overview Grid */
.overview-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-canvas);
}

.overview-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-canvas);
  flex-shrink: 0;
}

.overview-search-wrap {
  flex: 1;
  min-width: 180px;
  max-width: 280px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-subtle);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
}

.overview-search-wrap:focus-within {
  border-color: var(--accent);
  background: var(--bg-panel);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.overview-search-ico {
  color: var(--text-muted);
}

.overview-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
}

.overview-cats {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.overview-grid-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.tool-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  text-align: left;
  box-shadow: var(--shadow-sm), var(--hairline);
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
}

.tool-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-accent);
  box-shadow: var(--shadow-md);
  background: var(--bg-panel);
}

.tool-card-top {
  display: flex;
  align-items: center;
  gap: 9px;
}

.card-ico-badge {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.tool-card-headings {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tool-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mini-tag {
  padding: 0 5px;
  height: 16px;
  line-height: 16px;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
}

.card-arrow {
  color: var(--text-muted);
  opacity: 0.5;
  transition: transform 140ms ease, opacity 140ms ease, color 140ms ease;
}

.tool-card:hover .card-arrow {
  transform: translateX(2px);
  opacity: 1;
  color: var(--accent);
}

.tool-card-desc {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.overview-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Bottom Status Bar (26px) */
.status-bar {
  height: 26px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.status-tool-name {
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-metrics {
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.offline-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--success);
  font-weight: 600;
  white-space: nowrap;
}

.offline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

/* Mobile drawer & narrow viewport */
.mobile-menu-btn {
  display: none;
}

.mobile-nav-backdrop {
  display: none;
}

@media (max-width: 640px) {
  .mobile-menu-btn {
    display: inline-flex;
  }

  .collapse-btn {
    display: none;
  }

  .workbench-nav {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 210px !important;
    transform: translateX(-100%);
    transition: transform 180ms ease;
    box-shadow: var(--shadow-modal);
  }

  .workbench-nav.mobile-open {
    transform: translateX(0);
  }

  .mobile-nav-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 20, 32, 0.36);
    z-index: 25;
  }

  .header-cat-badge,
  .btn-text,
  .cmd-trigger-label {
    display: none;
  }

  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.studio-toast {
  position: fixed;
  right: 16px;
  bottom: 36px;
  z-index: 120;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  box-shadow: var(--shadow-md);
}

.studio-toast.toast-success {
  border-color: rgba(31, 128, 100, 0.35);
  color: var(--success);
}

.studio-toast.toast-error {
  border-color: rgba(207, 61, 76, 0.35);
  color: var(--danger);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
