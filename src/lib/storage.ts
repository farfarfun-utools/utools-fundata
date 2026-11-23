import type { IconName } from '../components/AppIcon.vue'
import { isLikelyCronExpression } from './cron'
import { detectFormat, type IndentOption } from './formats'
import type { Locale } from './i18n'
import { parseColor } from './units'

export type ToolId =
  | 'convert'
  | 'sql'
  | 'proto'
  | 'encoding'
  | 'jwt'
  | 'hash'
  | 'idgen'
  | 'timestamp'
  | 'cron'
  | 'regex'
  | 'color'
  | 'radix'
  | 'bytes'
  | 'diff'
  | 'textbatch'

export type ActiveView = 'overview' | ToolId

export type ToolCategory = 'structure' | 'security' | 'datetime' | 'textunits'

export type ToolTone =
  | 'violet'
  | 'indigo'
  | 'blue'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'cyan'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ToolMeta {
  id: ToolId
  category: ToolCategory
  icon: IconName
  tone: ToolTone
  nameZh: string
  nameEn: string
  shortZh: string
  shortEn: string
  descZh: string
  descEn: string
  tags: string[]
  keywords: string[]
}

export interface FunDataSettings {
  theme: ThemeMode
  locale: Locale
  defaultIndent: IndentOption
  fontSize: number
  timeZone: string
}

export interface StudioState {
  version: number
  activeView: ActiveView
  settings: FunDataSettings
}

export const TOOL_CATEGORIES: Array<{
  id: ToolCategory
  labelZh: string
  labelEn: string
}> = [
  { id: 'structure', labelZh: '格式与结构', labelEn: 'Format & Structure' },
  { id: 'security', labelZh: '编码与安全', labelEn: 'Codec & Security' },
  { id: 'datetime', labelZh: '时间与正则', labelEn: 'Time & Regex' },
  { id: 'textunits', labelZh: '换算与文本', labelEn: 'Units & Text' },
]

export const TOOL_REGISTRY: ToolMeta[] = [
  {
    id: 'convert',
    category: 'structure',
    icon: 'arrows-left-right',
    tone: 'violet',
    nameZh: '10 格式万能互转',
    nameEn: '10-Format Converter',
    shortZh: '格式互转',
    shortEn: 'Convert',
    descZh: 'JSON / JSON5 / YAML / TOML / XML / CSV / TSV / INI / NDJSON / Query 双向无损互转',
    descEn: 'Bidirectional conversion across JSON, YAML, TOML, XML, CSV, INI, NDJSON & Query',
    tags: ['JSON', 'YAML', 'TOML', 'XML', 'CSV'],
    keywords: ['convert', 'json', 'json5', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'ndjson', 'query', '格式', '互转', '转换'],
  },
  {
    id: 'sql',
    category: 'structure',
    icon: 'database',
    tone: 'blue',
    nameZh: 'SQL 格式化与美化',
    nameEn: 'SQL Formatter',
    shortZh: 'SQL 美化',
    shortEn: 'SQL',
    descZh: '支持 Standard / MySQL / PostgreSQL / SQLite / BigQuery / T-SQL 美化与单行压缩',
    descEn: 'Format & minify SQL queries across MySQL, PostgreSQL, SQLite, BigQuery & T-SQL',
    tags: ['MySQL', 'Postgres', 'Minify'],
    keywords: ['sql', 'mysql', 'postgresql', 'sqlite', 'bigquery', 'tsql', 'format', '美化', '压缩', '查询'],
  },
  {
    id: 'proto',
    category: 'structure',
    icon: 'list-ordered',
    tone: 'indigo',
    nameZh: 'Protobuf 重编号',
    nameEn: 'Protobuf Renumber',
    shortZh: 'Proto 重编号',
    shortEn: 'Proto',
    descZh: '自动跳过 reserved 与 19000..19999、保留 allow_alias 别名并提供并排 Diff 预览',
    descEn: 'Safely renumber message & enum tags respecting reserved ranges with side-by-side diff',
    tags: ['proto3', 'reserved', 'Diff'],
    keywords: ['proto', 'protobuf', 'grpc', 'renumber', '重编号', '协议', '字段'],
  },
  {
    id: 'encoding',
    category: 'security',
    icon: 'binary',
    tone: 'teal',
    nameZh: '文本编解码',
    nameEn: 'Text Codec',
    shortZh: '文本编解码',
    shortEn: 'Text Codec',
    descZh: 'Base64 / URL / Unicode / HTML / Hex / JSON 字符串转义双向编解码',
    descEn: 'Bidirectional Base64, URL, Unicode, HTML, Hex & JSON string codecs',
    tags: ['Base64', 'URL', 'Unicode', 'Hex'],
    keywords: ['encode', 'decode', 'codec', 'base64', 'url', 'unicode', 'html', 'hex', '编码', '解码', '编解码'],
  },
  {
    id: 'jwt',
    category: 'security',
    icon: 'key-round',
    tone: 'amber',
    nameZh: 'JWT 解析与签发',
    nameEn: 'JWT Inspector & Signer',
    shortZh: 'JWT 工具',
    shortEn: 'JWT',
    descZh: '大整数保真解析、exp/nbf 实时状态检查及 Web Crypto HS256/384/512 验签与签发',
    descEn: 'Lossless BigInt JWT decode, claim status checks, HMAC verify & offline signing',
    tags: ['HS256', 'Verify', 'Sign'],
    keywords: ['jwt', 'token', 'bearer', 'hs256', 'hs384', 'hs512', 'hmac', 'sign', 'verify', '令牌', '鉴权', '验签', '签发'],
  },
  {
    id: 'hash',
    category: 'security',
    icon: 'shield-check',
    tone: 'emerald',
    nameZh: '哈希与 HMAC 摘要',
    nameEn: 'Hash & HMAC Digest',
    shortZh: '哈希·HMAC',
    shortEn: 'Hash & HMAC',
    descZh: '实时并行计算 MD5 / SHA-1 / SHA-256 / SHA-384 / SHA-512 摘要与 HMAC 签名',
    descEn: 'Parallel MD5, SHA-1, SHA-256, SHA-384 & SHA-512 digests and HMAC signing',
    tags: ['MD5', 'SHA-256', 'HMAC'],
    keywords: ['hash', 'hmac', 'md5', 'sha1', 'sha256', 'sha384', 'sha512', 'digest', '哈希', '摘要', '签名'],
  },
  {
    id: 'idgen',
    category: 'security',
    icon: 'fingerprint',
    tone: 'cyan',
    nameZh: 'UUID 与密钥生成',
    nameEn: 'UUID & Secret Generator',
    shortZh: 'UUID·密钥',
    shortEn: 'UUID & Keys',
    descZh: '1–50 条批量生成 UUID v4 / ULID / NanoID / Hex 32·64 / Base64URL 随机密钥',
    descEn: 'Batch generate 1–50 UUID v4, ULID, NanoID, Hex 32/64 & Base64URL secrets',
    tags: ['UUID v4', 'ULID', 'NanoID'],
    keywords: ['uuid', 'ulid', 'nanoid', 'secret', 'key', 'random', 'id', '密钥', '随机', '生成器'],
  },
  {
    id: 'timestamp',
    category: 'datetime',
    icon: 'calendar-clock',
    tone: 'indigo',
    nameZh: 'Unix 时间戳与多时区',
    nameEn: 'Unix Timestamp & Timezones',
    shortZh: '时间戳',
    shortEn: 'Timestamp',
    descZh: '自动识别秒/毫秒 Unix 时间戳、日期互转、ISO 8601 / RFC 2822 与 5 大时区对照',
    descEn: 'Auto s/ms Unix timestamp & date conversion with ISO 8601, RFC 2822 & 5 world timezones',
    tags: ['Unix s/ms', 'ISO 8601', '5 Zones'],
    keywords: ['timestamp', 'unix', 'epoch', 'date', 'time', 'timezone', 'iso', '时间', '时间戳', '时区', '日期'],
  },
  {
    id: 'cron',
    category: 'datetime',
    icon: 'clock',
    tone: 'cyan',
    nameZh: 'Cron 表达式解析',
    nameEn: 'Cron Expression Parser',
    shortZh: 'Cron 解析',
    shortEn: 'Cron',
    descZh: '支持 5/6 位 Cron 中英语义解析、逐字段拆解及任意时区未来 10 次精确触发时间',
    descEn: '5/6-field Cron explanation, field breakdown & next 10 exact trigger timestamps',
    tags: ['5/6-Field', 'Next 10', 'TZ'],
    keywords: ['cron', 'crontab', 'schedule', 'timer', '定时', '调度', '表达式'],
  },
  {
    id: 'regex',
    category: 'datetime',
    icon: 'regex',
    tone: 'rose',
    nameZh: '正则表达式实验室',
    nameEn: 'Regex Lab',
    shortZh: '正则实验',
    shortEn: 'Regex',
    descZh: '实时匹配高亮、捕获组明细表、替换模板预览与 7 组高频开发正则预设',
    descEn: 'Live match highlighting, capture group table, replace preview & 7 curated presets',
    tags: ['Match', 'Groups', 'Replace'],
    keywords: ['regex', 'regexp', 'pattern', 'match', 'replace', '正则', '匹配', '捕获组'],
  },
  {
    id: 'color',
    category: 'textunits',
    icon: 'palette',
    tone: 'violet',
    nameZh: '颜色与 WCAG 对比度',
    nameEn: 'Color & WCAG Contrast',
    shortZh: '颜色对比度',
    shortEn: 'Color',
    descZh: 'HEX / HEX8 / RGB / RGBA / HSL 双向换算，实时计算黑白文字 WCAG AA/AAA 对比度',
    descEn: 'Convert HEX, RGB & HSL with live WCAG AA/AAA contrast ratings on light & dark text',
    tags: ['HEX', 'RGB/HSL', 'WCAG'],
    keywords: ['color', 'hex', 'rgb', 'rgba', 'hsl', 'wcag', 'contrast', '颜色', '色值', '对比度', '取色'],
  },
  {
    id: 'radix',
    category: 'textunits',
    icon: 'hash',
    tone: 'amber',
    nameZh: 'BigInt 多进制换算',
    nameEn: 'BigInt Radix Converter',
    shortZh: '进制换算',
    shortEn: 'Radix',
    descZh: 'BigInt 精确同步转换 2 / 8 / 10 / 16 / 36 进制与位宽显示，大整数不丢精度',
    descEn: 'Lossless BigInt conversion across Binary, Octal, Decimal, Hex & Base36 with bit length',
    tags: ['Bin/Oct', 'Dec/Hex', 'Base36'],
    keywords: ['radix', 'base', 'binary', 'octal', 'decimal', 'hex', 'base36', 'bigint', '进制', '二进制', '十六进制'],
  },
  {
    id: 'bytes',
    category: 'textunits',
    icon: 'hard-drive',
    tone: 'teal',
    nameZh: '字节存储单位换算',
    nameEn: 'Byte Unit Converter',
    shortZh: '字节换算',
    shortEn: 'Bytes',
    descZh: '支持 IEC（1024）与 SI（1000）双标准，一键换算 B / KB / MB / GB / TB / PB',
    descEn: 'Convert B, KB, MB, GB, TB & PB across both IEC (1024) and SI (1000) standards',
    tags: ['IEC 1024', 'SI 1000', 'B–PB'],
    keywords: ['byte', 'bytes', 'kb', 'mb', 'gb', 'tb', 'pb', 'kib', 'mib', 'gib', 'iec', 'si', '字节', '存储', '单位'],
  },
  {
    id: 'diff',
    category: 'textunits',
    icon: 'diff',
    tone: 'blue',
    nameZh: '双行号文本对比',
    nameEn: 'Side-by-Side Text Diff',
    shortZh: '文本对比',
    shortEn: 'Text Diff',
    descZh: '左右双栏并排文本对比、增删改统计、忽略空白切换与 Unified Patch 一键复制导出',
    descEn: 'Side-by-side line diff with change stats, ignore-whitespace toggle & unified patch export',
    tags: ['Side-by-Side', 'Patch', 'Diff'],
    keywords: ['diff', 'compare', 'patch', 'merge', '文本对比', '对比', '差异', '比对'],
  },
  {
    id: 'textbatch',
    category: 'textunits',
    icon: 'file-text',
    tone: 'emerald',
    nameZh: '文本批处理与统计',
    nameEn: 'Text Batch & Stats',
    shortZh: '文本批处理',
    shortEn: 'Text Batch',
    descZh: '一键去重、升降序、逆序、去空行、Trim、批量加前后缀及实时字数与 Top 10 行频',
    descEn: 'Dedupe, sort, reverse, trim, batch affix transforms with live word stats & Top 10 frequency',
    tags: ['Dedupe', 'Sort', 'Affix', 'Freq'],
    keywords: ['text', 'batch', 'dedupe', 'sort', 'trim', 'lines', 'affix', 'freq', '批处理', '去重', '排序', '词频', '统计'],
  },
]

export function getToolMeta(id: ToolId): ToolMeta {
  return TOOL_REGISTRY.find((item) => item.id === id) ?? TOOL_REGISTRY[0]
}

export const SAMPLES = {
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzIwMjYiLCJuYW1lIjoiQWxpY2UgQ2hlbiIsInJvbGUiOiJhZG1pbiIsInNub3dmbGFrZUlkIjo5MDA3MTk5MjU0NzQwOTk5LCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0.vVcn-jW6X9xqtAqwa0VHR48kJhpNJXjibTTBgJYI1z0',
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
  diffLeft: [
    'service: fundata-gateway',
    'version: 2.3.0',
    'server:',
    '  host: 127.0.0.1',
    '  port: 8080',
    '  tls: false',
    'features:',
    '  - convert',
    '  - jwt',
    '  - proto',
  ].join('\n'),
  diffRight: [
    'service: fundata-gateway',
    'version: 2.4.0',
    'server:',
    '  host: 0.0.0.0',
    '  port: 8443',
    '  tls: true',
    'features:',
    '  - convert',
    '  - sql',
    '  - jwt',
    '  - proto',
    '  - cron',
  ].join('\n'),
  batchText: [
    'api-gateway',
    'auth-service',
    '  billing-worker  ',
    'api-gateway',
    '',
    'data-pipeline',
    'auth-service',
    'api-gateway',
    'search-indexer',
    'billing-worker',
  ].join('\n'),
} as const

export interface RouteDecision {
  tool: ToolId
  payload: string
}

const JWT_TOKEN_REGEX =
  /^(?:Bearer\s+)?[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*$/i

export function detectRouteForInput(rawInput: string, filename?: string): RouteDecision {
  const trimmed = rawInput.trim()

  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'proto') return { tool: 'proto', payload: rawInput }
    if (ext === 'sql') return { tool: 'sql', payload: rawInput }
    if (
      ['json', 'json5', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'ndjson', 'jsonl'].includes(
        ext,
      )
    ) {
      return { tool: 'convert', payload: rawInput }
    }
  }

  if (!trimmed) return { tool: 'convert', payload: rawInput }

  // 1. JWT
  if (JWT_TOKEN_REGEX.test(trimmed)) {
    return { tool: 'jwt', payload: trimmed }
  }

  // 2. Cron
  if (isLikelyCronExpression(trimmed)) {
    return { tool: 'cron', payload: trimmed }
  }

  // 3. Color
  if (
    !trimmed.includes('\n') &&
    /^(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/i.test(trimmed) &&
    parseColor(trimmed) !== null
  ) {
    return { tool: 'color', payload: trimmed }
  }

  // 3b. Hex / Binary / Octal radix literals
  if (!trimmed.includes('\n') && /^(?:0x[0-9a-f]+|0b[01]+|0o[0-7]+)$/i.test(trimmed)) {
    return { tool: 'radix', payload: trimmed }
  }

  // 4. SQL / Protobuf / Convertible formats
  const fmt = detectFormat(trimmed, filename)
  if (fmt === 'sql') return { tool: 'sql', payload: rawInput }
  if (fmt === 'protobuf') return { tool: 'proto', payload: rawInput }
  if (
    fmt === 'json' ||
    fmt === 'json5' ||
    fmt === 'jsonc' ||
    fmt === 'yaml' ||
    fmt === 'toml' ||
    fmt === 'xml' ||
    fmt === 'csv' ||
    fmt === 'tsv' ||
    fmt === 'ini' ||
    fmt === 'ndjson'
  ) {
    return { tool: 'convert', payload: rawInput }
  }

  // 5. URL query string
  if (
    !trimmed.includes('\n') &&
    ((trimmed.startsWith('?') && trimmed.includes('=')) ||
      /^https?:\/\/.+\?.+=/.test(trimmed) ||
      /^[^={}[\]<\s]+=[^&]*(?:&[^={}[\]<\s]+=[^&]*)+$/.test(trimmed))
  ) {
    return { tool: 'convert', payload: trimmed }
  }

  // 6. Unix Timestamp (10-digit seconds or 13-digit milliseconds)
  if (/^-?\d{10}$/.test(trimmed) || /^-?\d{13}$/.test(trimmed)) {
    return { tool: 'timestamp', payload: trimmed }
  }

  // 7. URL-encoded / Unicode escape / Base64
  if (
    /%[0-9a-fA-F]{2}/.test(trimmed) ||
    /\\u[0-9a-fA-F]{4}/.test(trimmed) ||
    (!trimmed.includes(' ') &&
      trimmed.length >= 12 &&
      trimmed.length % 4 === 0 &&
      /^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed) &&
      (/[+/=]/.test(trimmed) || (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed) && /\d/.test(trimmed))))
  ) {
    return { tool: 'encoding', payload: trimmed }
  }

  return { tool: 'textbatch', payload: rawInput }
}

const STORAGE_KEY = 'fundata.studio.v2'
const STUDIO_VERSION = 2

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
    timeZone,
  }
}

export function createDefaultStudioState(): StudioState {
  return {
    version: STUDIO_VERSION,
    activeView: 'overview',
    settings: createDefaultSettings(),
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
    // ignore
  }
  return null
}

const VALID_VIEWS = new Set<string>(['overview', ...TOOL_REGISTRY.map((t) => t.id)])

const LEGACY_VIEW_MAP: Record<string, ActiveView> = {
  crypto: 'hash',
  units: 'color',
  text: 'diff',
}

export function loadStudioState(): StudioState {
  const fallback = createDefaultStudioState()
  const storage = getSafeStorage()
  if (!storage) return fallback

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StudioState>
    if (!parsed || typeof parsed !== 'object') return fallback

    const defaults = createDefaultSettings()
    const rawSettings = parsed.settings ?? ({} as Partial<FunDataSettings>)
    const settings: FunDataSettings = {
      theme:
        rawSettings.theme === 'light' || rawSettings.theme === 'dark' || rawSettings.theme === 'system'
          ? rawSettings.theme
          : defaults.theme,
      locale: rawSettings.locale === 'en' ? 'en' : 'zh-CN',
      defaultIndent:
        rawSettings.defaultIndent === '4' || rawSettings.defaultIndent === 'tab'
          ? rawSettings.defaultIndent
          : '2',
      fontSize:
        typeof rawSettings.fontSize === 'number' &&
        rawSettings.fontSize >= 12 &&
        rawSettings.fontSize <= 16
          ? rawSettings.fontSize
          : defaults.fontSize,
      timeZone:
        typeof rawSettings.timeZone === 'string' && rawSettings.timeZone.trim()
          ? rawSettings.timeZone
          : defaults.timeZone,
    }

    const rawView =
      typeof parsed.activeView === 'string'
        ? (LEGACY_VIEW_MAP[parsed.activeView] ?? parsed.activeView)
        : 'overview'
    const activeView = VALID_VIEWS.has(rawView) ? (rawView as ActiveView) : 'overview'

    return {
      version: STUDIO_VERSION,
      activeView,
      settings,
    }
  } catch {
    return fallback
  }
}

export function saveStudioState(state: StudioState): void {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STUDIO_VERSION,
        activeView: state.activeView,
        settings: state.settings,
      }),
    )
  } catch {
    // ignore storage quota errors
  }
}
