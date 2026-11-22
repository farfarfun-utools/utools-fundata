import type { AiConfig } from './ai-repair'
import { parseJsonLike, type DataFormat, type IndentOption } from './formats'
import type { Locale } from './i18n'

export type ViewMode = 'code' | 'tree' | 'columns' | 'table' | 'diff'

export type ToolId =
  | 'repair'
  | 'types'
  | 'convert'
  | 'jsonpath'
  | 'naming'
  | 'encoding'
  | 'jwt'
  | 'proto'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface TabHistoryEntry {
  id: string
  content: string
  format: DataFormat
  timestamp: number
  label?: string
}

export interface TabItem {
  id: string
  title: string
  format: DataFormat
  content: string
  diffRight: string
  indent: IndentOption
  filename?: string
  updatedAt: number
  history: TabHistoryEntry[]
}

export interface SmartDisplaySettings {
  embeddedJson: boolean
  colorSwatch: boolean
  timestamp: boolean
  base64: boolean
  foldSummary: boolean
}

export interface FunDataSettings {
  theme: ThemeMode
  locale: Locale
  defaultIndent: IndentOption
  fontSize: number
  wordWrap: boolean
  timeZone: string
  smartDisplay: SmartDisplaySettings
  ai: AiConfig
}

export interface WorkspaceState {
  version: number
  activeTabId: string
  viewMode: ViewMode
  activeTool: ToolId | null
  tabs: TabItem[]
  settings: FunDataSettings
}

const STORAGE_KEY = 'fundata.workspace.v1'
const WORKSPACE_VERSION = 1
const MAX_PERSISTED_CONTENT_LEN = 250_000
const DEFAULT_MAX_HISTORY = 20

export const SAMPLES = {
  json: JSON.stringify(
    {
      service: 'fundata-workbench',
      version: '0.1.0',
      generatedAt: 1732272000,
      accentColor: '#0EA5E9',
      metadata: {
        region: 'ap-east-1',
        encodedTag: 'RnVuRGF0YSDmlbDlvaLkuIflj5g=',
        callbackUrl: 'https%3A%2F%2Ffarfarfun.dev%2Fapi%3Fq%3Djson',
      },
      users: [
        {
          id: 1001,
          name: 'Alice Chen',
          role: 'admin',
          active: true,
          score: 96.5,
          tags: ['core', 'jsonpath', 'schema'],
        },
        {
          id: 1002,
          name: 'Bob Lin',
          role: 'developer',
          active: true,
          score: 91,
          tags: ['proto', 'diff'],
          nickname: 'bobby',
        },
        {
          id: 1003,
          name: 'Carol Wu',
          role: 'viewer',
          active: false,
          score: 78,
          tags: ['table'],
        },
      ],
    },
    null,
    2,
  ),
  yaml: [
    'service: fundata-gateway',
    'environment: production',
    'server:',
    '  host: 0.0.0.0',
    '  port: 8443',
    '  tls: true',
    'routes:',
    '  - path: /v1/format',
    '    methods: [POST]',
    '    timeoutMs: 3000',
    '  - path: /v1/convert',
    '    methods: [POST, PUT]',
    '    timeoutMs: 5000',
  ].join('\n'),
  protobuf: [
    'syntax = "proto3";',
    '',
    'package fundata.v1;',
    '',
    'enum JobStatus {',
    '  option allow_alias = true;',
    '  JOB_STATUS_UNSPECIFIED = 5;',
    '  JOB_STATUS_PENDING = 9;',
    '  JOB_STATUS_QUEUED = 9;',
    '  JOB_STATUS_DONE = 20;',
    '}',
    '',
    'message TransformJob {',
    '  reserved 2, 4 to 6;',
    '  string job_id = 10;',
    '  JobStatus status = 15;',
    '  oneof payload {',
    '    string raw_json = 30;',
    '    bytes binary_data = 40;',
    '  }',
    '  map<string, string> labels = 50;',
    '}',
  ].join('\n'),
  // Valid HS256 JWT signed with secret "fundata-secret"
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzIwMjYiLCJuYW1lIjoiQWxpY2UgQ2hlbiIsInJvbGUiOiJhZG1pbiIsInNub3dmbGFrZUlkIjo5MDA3MTk5MjU0NzQwOTk5LCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0.vVcn-jW6X9xqtAqwa0VHR48kJhpNJXjibTTBgJYI1z0',
} as const

function generateId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultSettings(): FunDataSettings {
  let timeZone = 'Asia/Shanghai'
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone
  } catch {
    // keep default
  }
  return {
    theme: 'system',
    locale: 'zh-CN',
    defaultIndent: '2',
    fontSize: 13,
    wordWrap: true,
    timeZone,
    smartDisplay: {
      embeddedJson: true,
      colorSwatch: true,
      timestamp: true,
      base64: true,
      foldSummary: true,
    },
    ai: {
      provider: 'local',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: '',
      timeoutMs: 20000,
    },
  }
}

export function createTab(partial?: Partial<TabItem>): TabItem {
  return {
    id: partial?.id ?? generateId('tab'),
    title: partial?.title ?? 'Untitled',
    format: partial?.format ?? 'json',
    content: partial?.content ?? '',
    diffRight: partial?.diffRight ?? '',
    indent: partial?.indent ?? '2',
    filename: partial?.filename,
    updatedAt: partial?.updatedAt ?? Date.now(),
    history: partial?.history ?? [],
  }
}

export function createDefaultWorkspace(): WorkspaceState {
  const initialTab = createTab({
    id: 'tab_welcome',
    title: 'fundata-workbench',
    format: 'json',
    content: SAMPLES.json,
    diffRight: SAMPLES.json,
  })
  return {
    version: WORKSPACE_VERSION,
    activeTabId: initialTab.id,
    viewMode: 'code',
    activeTool: null,
    tabs: [initialTab],
    settings: createDefaultSettings(),
  }
}

export function autoTabName(
  content: string,
  format: DataFormat,
  fallback = 'Untitled',
): string {
  const trimmed = content.trim()
  if (!trimmed) return fallback

  if (format === 'json' || format === 'jsonc' || format === 'json5') {
    try {
      const parsed = parseJsonLike(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>
        for (const candidateKey of ['name', 'title', 'service', 'id', 'app', 'project']) {
          const val = record[candidateKey]
          if (typeof val === 'string' && val.trim()) {
            return val.trim().slice(0, 28)
          }
        }
        const firstKey = Object.keys(record)[0]
        if (firstKey) return firstKey.slice(0, 28)
      }
      if (Array.isArray(parsed)) {
        return `Array[${parsed.length}]`
      }
    } catch {
      // fall through
    }
  }

  if (format === 'protobuf') {
    const msgMatch = /\b(?:message|service|enum)\s+([A-Za-z_]\w*)/.exec(trimmed)
    if (msgMatch) return `${msgMatch[1]}.proto`
  }

  if (format === 'xml' || format === 'html') {
    const tagMatch = /<([A-Za-z_][\w:.-]*)/.exec(
      trimmed.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!doctype[^>]*>/i, ''),
    )
    if (tagMatch) return `<${tagMatch[1]}>`
  }

  if (format === 'yaml' || format === 'toml' || format === 'ini') {
    const lineMatch = /^(?:name|title|service)\s*[:=]\s*["']?([^"'\r\n]+)["']?/im.exec(trimmed)
    if (lineMatch) return lineMatch[1].trim().slice(0, 28)
  }

  if (format === 'sql') {
    const tableMatch = /\b(?:FROM|INTO|TABLE|UPDATE)\s+[`"']?([A-Za-z_][\w.]*)[`"']?/i.exec(trimmed)
    if (tableMatch) return `${tableMatch[1]}.sql`
  }

  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? ''
  if (firstLine && firstLine.length <= 28) {
    return firstLine
  }
  return fallback
}

export function pushTabHistory(
  tab: TabItem,
  label?: string,
  maxEntries = DEFAULT_MAX_HISTORY,
): TabItem {
  const latest = tab.history[0]
  if (latest && latest.content === tab.content && latest.format === tab.format) {
    return tab
  }
  const entry: TabHistoryEntry = {
    id: generateId('hist'),
    content: tab.content,
    format: tab.format,
    timestamp: Date.now(),
    label,
  }
  const nextHistory = [entry, ...tab.history].slice(0, Math.max(1, maxEntries))
  return {
    ...tab,
    updatedAt: entry.timestamp,
    history: nextHistory,
  }
}

function getSafeStorage(): Storage | null {
  try {
    const candidate =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : globalThis.localStorage
    if (
      candidate &&
      typeof candidate.getItem === 'function' &&
      typeof candidate.setItem === 'function'
    ) {
      return candidate
    }
  } catch {
    // ignore inaccessible storage
  }
  return null
}

export function loadWorkspace(): WorkspaceState {
  const fallback = createDefaultWorkspace()
  const storage = getSafeStorage()
  if (!storage) {
    return fallback
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return fallback
    }

    const tabs: TabItem[] = parsed.tabs
      .filter((item): item is TabItem => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
      .map((item) =>
        createTab({
          id: item.id,
          title: typeof item.title === 'string' && item.title ? item.title : 'Untitled',
          format: item.format ?? 'json',
          content: typeof item.content === 'string' ? item.content : '',
          diffRight: typeof item.diffRight === 'string' ? item.diffRight : '',
          indent: item.indent === '4' || item.indent === 'tab' ? item.indent : '2',
          filename: typeof item.filename === 'string' ? item.filename : undefined,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
          history: Array.isArray(item.history) ? item.history.slice(0, DEFAULT_MAX_HISTORY) : [],
        }),
      )

    if (tabs.length === 0) return fallback

    const defaults = createDefaultSettings()
    const rawSettings = parsed.settings ?? ({} as Partial<FunDataSettings>)
    const settings: FunDataSettings = {
      ...defaults,
      ...rawSettings,
      smartDisplay: {
        ...defaults.smartDisplay,
        ...(rawSettings.smartDisplay ?? {}),
      },
      ai: {
        ...defaults.ai,
        ...(rawSettings.ai ?? {}),
      },
    }

    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
      ? (parsed.activeTabId as string)
      : tabs[0].id

    const validViews: ViewMode[] = ['code', 'tree', 'columns', 'table', 'diff']
    const viewMode = validViews.includes(parsed.viewMode as ViewMode)
      ? (parsed.viewMode as ViewMode)
      : 'code'

    return {
      version: WORKSPACE_VERSION,
      activeTabId,
      viewMode,
      activeTool: parsed.activeTool ?? null,
      tabs,
      settings,
    }
  } catch {
    return fallback
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  const storage = getSafeStorage()
  if (!storage) return
  const sanitizedTabs = state.tabs.map((tab) => ({
    ...tab,
    content: tab.content.slice(0, MAX_PERSISTED_CONTENT_LEN),
    diffRight: tab.diffRight.slice(0, MAX_PERSISTED_CONTENT_LEN),
    history: tab.history
      .slice(0, DEFAULT_MAX_HISTORY)
      .filter((entry) => entry.content.length <= 50_000),
  }))

  const payload: WorkspaceState = {
    ...state,
    version: WORKSPACE_VERSION,
    tabs: sanitizedTabs,
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Retry without history if quota exceeded
    try {
      const compact: WorkspaceState = {
        ...payload,
        tabs: sanitizedTabs.map((tab) => ({ ...tab, history: [] })),
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(compact))
    } catch {
      // ignore storage quota errors
    }
  }
}
