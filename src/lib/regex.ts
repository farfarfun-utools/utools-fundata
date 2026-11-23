export type RegexFlag = 'g' | 'i' | 'm' | 's' | 'u'

export interface RegexPreset {
  id: string
  labelZh: string
  labelEn: string
  pattern: string
  flags: RegexFlag[]
  sampleText: string
  replacement: string
}

export interface RegexSegment {
  text: string
  isMatch: boolean
  matchIndex?: number
}

export interface RegexMatchItem {
  index: number
  match: string
  start: number
  end: number
  groups: string[]
  namedGroups?: Record<string, string>
}

export interface RegexEvalResult {
  valid: boolean
  error?: string
  count: number
  matches: RegexMatchItem[]
  segments: RegexSegment[]
  replaced: string
  truncated: boolean
}

export const REGEX_FLAGS: Array<{ flag: RegexFlag; labelZh: string; labelEn: string }> = [
  { flag: 'g', labelZh: '全局', labelEn: 'global' },
  { flag: 'i', labelZh: '忽略大小写', labelEn: 'ignoreCase' },
  { flag: 'm', labelZh: '多行', labelEn: 'multiline' },
  { flag: 's', labelZh: '点通配换行', labelEn: 'dotAll' },
  { flag: 'u', labelZh: 'Unicode', labelEn: 'unicode' },
]

export const REGEX_PRESETS: RegexPreset[] = [
  {
    id: 'email',
    labelZh: '电子邮箱',
    labelEn: 'Email',
    pattern: '([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
    flags: ['g', 'i'],
    sampleText:
      'Contact support@farfarfun.dev or alice.chen@studio.io for API access.\nInvalid: not-an-email@, ops@internal',
    replacement: '$1 [at] $2',
  },
  {
    id: 'cn-mobile',
    labelZh: '中国手机号',
    labelEn: 'CN Mobile',
    pattern: '(?<!\\d)(1[3-9]\\d)(\\d{4})(\\d{4})(?!\\d)',
    flags: ['g'],
    sampleText: '客服热线: 13800138000 / 备用: 18612345678 / 固话: 010-88886666',
    replacement: '$1****$3',
  },
  {
    id: 'url',
    labelZh: 'URL 链接',
    labelEn: 'URL',
    pattern: '(https?)://([\\w.-]+)(:[0-9]+)?(/[\\w./?%&=-]*)?',
    flags: ['g', 'i'],
    sampleText:
      'Docs: https://farfarfun.github.io/packages/utools-fundata/\nLocal: http://127.0.0.1:8080/api/v1?mode=dev',
    replacement: '[$2]($&)',
  },
  {
    id: 'ipv4',
    labelZh: 'IPv4 地址',
    labelEn: 'IPv4',
    pattern: '\\b((?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3})\\b',
    flags: ['g'],
    sampleText: 'Nodes: 10.0.12.45, 192.168.1.254, 127.0.0.1 (invalid: 999.1.2.3)',
    replacement: 'IP($1)',
  },
  {
    id: 'iso-date',
    labelZh: 'ISO 日期',
    labelEn: 'ISO Date',
    pattern: '(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])',
    flags: ['g'],
    sampleText: 'Release dates: 2026-03-15, 2026-11-22, invalid: 2026-13-40',
    replacement: '$1/$2/$3',
  },
  {
    id: 'chinese',
    labelZh: '中文字符',
    labelEn: 'Chinese',
    pattern: '[\\u4e00-\\u9fa5]+',
    flags: ['g', 'u'],
    sampleText: 'FunData 数形万变 v2.0 — 开发者离线数据工具箱 (100% Offline)',
    replacement: '【$&】',
  },
  {
    id: 'semver',
    labelZh: 'SemVer 版本',
    labelEn: 'SemVer',
    pattern: 'v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z.-]+))?',
    flags: ['g'],
    sampleText: 'Packages: @farfarfun/fundata v0.1.0, vue 3.5.13, vite 7.3.7-beta.1',
    replacement: 'major=$1 minor=$2 patch=$3',
  },
]

const MAX_MATCHES = 2000

export function evaluateRegex(
  pattern: string,
  flags: RegexFlag[],
  text: string,
  replacement = '',
): RegexEvalResult {
  if (!pattern) {
    return {
      valid: true,
      count: 0,
      matches: [],
      segments: text ? [{ text, isMatch: false }] : [],
      replaced: text,
      truncated: false,
    }
  }

  const normalizedFlags = Array.from(new Set(flags)).join('')
  let regex: RegExp
  try {
    regex = new RegExp(pattern, normalizedFlags)
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid regular expression',
      count: 0,
      matches: [],
      segments: text ? [{ text, isMatch: false }] : [],
      replaced: text,
      truncated: false,
    }
  }

  const matches: RegexMatchItem[] = []
  let truncated = false

  if (regex.global) {
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true
        break
      }
      const start = m.index
      const end = start + m[0].length
      matches.push({
        index: matches.length + 1,
        match: m[0],
        start,
        end,
        groups: m.slice(1).map((g) => (g === undefined ? '' : g)),
        namedGroups: m.groups
          ? Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v ?? '']))
          : undefined,
      })
      if (m[0].length === 0) {
        const cp = regex.unicode ? text.codePointAt(regex.lastIndex) : undefined
        regex.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1
        if (regex.lastIndex > text.length) break
      }
    }
  } else {
    const m = regex.exec(text)
    if (m) {
      matches.push({
        index: 1,
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        groups: m.slice(1).map((g) => (g === undefined ? '' : g)),
        namedGroups: m.groups
          ? Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v ?? '']))
          : undefined,
      })
    }
  }

  // Build XSS-safe text segments for Vue v-for rendering
  const segments: RegexSegment[] = []
  let cursor = 0
  for (const item of matches) {
    if (item.start > cursor) {
      segments.push({ text: text.slice(cursor, item.start), isMatch: false })
    }
    if (item.end > item.start) {
      segments.push({ text: text.slice(item.start, item.end), isMatch: true, matchIndex: item.index })
    } else {
      segments.push({ text: '', isMatch: true, matchIndex: item.index })
    }
    cursor = Math.max(cursor, item.end)
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false })
  }

  let replaced = text
  try {
    replaced = text.replace(new RegExp(pattern, normalizedFlags), replacement)
  } catch {
    replaced = text
  }

  return {
    valid: true,
    count: matches.length,
    matches,
    segments,
    replaced,
    truncated,
  }
}
