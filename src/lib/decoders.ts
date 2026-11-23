export type EncodingKind = 'base64' | 'url' | 'unicode' | 'html' | 'hex' | 'json-string'

export interface TimestampZoneEntry {
  timeZone: string
  label: string
  formatted: string
}

export interface TimestampInfo {
  seconds: number
  milliseconds: number
  iso: string
  rfc2822: string
  local: string
  relative: string
  zones: TimestampZoneEntry[]
}

export const MULTI_TIMEZONES: Array<{ id: string; label: string }> = [
  { id: 'Asia/Shanghai', label: '上海 CST' },
  { id: 'UTC', label: 'UTC' },
  { id: 'America/New_York', label: '纽约 EST/EDT' },
  { id: 'Europe/London', label: '伦敦 GMT/BST' },
  { id: 'Asia/Tokyo', label: '东京 JST' },
]

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(raw: string): Uint8Array {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new Error('Invalid Base64 string')
  }
  const padLen = (4 - (cleaned.length % 4)) % 4
  const padded = cleaned + '='.repeat(padLen)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function encodeText(input: string, kind: EncodingKind): string {
  switch (kind) {
    case 'base64': {
      const bytes = new TextEncoder().encode(input)
      return bytesToBase64(bytes)
    }
    case 'url':
      return encodeURIComponent(input)
    case 'unicode': {
      let out = ''
      for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i)
        if (code > 0x7f) {
          out += `\\u${code.toString(16).padStart(4, '0')}`
        } else {
          out += input[i]
        }
      }
      return out
    }
    case 'html':
      return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    case 'hex': {
      const bytes = new TextEncoder().encode(input)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
    case 'json-string':
      return JSON.stringify(input)
  }
}

function safeFromCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback
  }
  return String.fromCodePoint(codePoint)
}

function wrapUnquotedJsonString(input: string): string {
  let out = '"'
  let escaped = false
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      out += ch
      escaped = true
      continue
    }
    if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else out += ch
  }
  if (escaped) out += '\\'
  out += '"'
  return out
}

export function decodeText(input: string, kind: EncodingKind): string {
  switch (kind) {
    case 'base64': {
      const bytes = base64ToBytes(input)
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    case 'url':
      return decodeURIComponent(input.replace(/\+/g, ' '))
    case 'unicode':
      return input
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (full, hex: string) =>
          safeFromCodePoint(parseInt(hex, 16), full),
        )
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        )
    case 'html':
      return input
        .replace(/&#x([0-9a-fA-F]+);/gi, (full, hex: string) =>
          safeFromCodePoint(parseInt(hex, 16), full),
        )
        .replace(/&#(\d+);/g, (full, dec: string) =>
          safeFromCodePoint(parseInt(dec, 10), full),
        )
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    case 'hex': {
      const cleaned = input.trim().replace(/^0x/i, '').replace(/[\s:-]+/g, '')
      if (!cleaned || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
        throw new Error('Invalid hex string')
      }
      const bytes = new Uint8Array(cleaned.length / 2)
      for (let i = 0; i < cleaned.length; i += 2) {
        bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16)
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    case 'json-string': {
      const trimmed = input.trim()
      if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (typeof parsed === 'string') return parsed
        } catch {
          // fall through to unquoted unescape
        }
      }
      return JSON.parse(wrapUnquotedJsonString(input)) as string
    }
  }
}

export function formatDateInTimeZone(date: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date)

    const map: Record<string, string> = {}
    for (const part of parts) {
      map[part.type] = part.value
    }
    const hh = map.hour === '24' ? '00' : map.hour
    return `${map.year}-${map.month}-${map.day} ${hh}:${map.minute}:${map.second}`
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 19)
  }
}

export function formatRelativeTime(diffMs: number, locale: 'zh-CN' | 'en' = 'en'): string {
  const abs = Math.abs(diffMs)
  const future = diffMs > 0
  const isZh = locale === 'zh-CN'
  if (abs < 5000) return isZh ? '刚刚' : 'just now'

  const units: Array<[number, string, string]> = [
    [1000 * 60 * 60 * 24 * 365, 'year', '年'],
    [1000 * 60 * 60 * 24 * 30, 'month', '个月'],
    [1000 * 60 * 60 * 24, 'day', '天'],
    [1000 * 60 * 60, 'hour', '小时'],
    [1000 * 60, 'minute', '分钟'],
    [1000, 'second', '秒'],
  ]

  for (const [unitMs, labelEn, labelZh] of units) {
    if (abs >= unitMs) {
      const count = Math.floor(abs / unitMs)
      if (isZh) {
        return future ? `${count} ${labelZh}后` : `${count} ${labelZh}前`
      }
      const plural = count === 1 ? labelEn : `${labelEn}s`
      return future ? `in ${count} ${plural}` : `${count} ${plural} ago`
    }
  }
  return isZh ? '刚刚' : 'just now'
}

export function formatTimestamp(
  ts: number | string,
  timeZone = 'Asia/Shanghai',
  locale: 'zh-CN' | 'en' = 'en',
): TimestampInfo | null {
  const raw = typeof ts === 'string' ? ts.trim() : String(ts)
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null
  const num = Number(raw)
  if (!Number.isFinite(num)) return null

  const isMs = Math.abs(num) >= 1e11
  const milliseconds = Math.trunc(isMs ? num : num * 1000)
  const seconds = Math.trunc(milliseconds / 1000)
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) return null

  const iso = date.toISOString()
  const rfc2822 = date.toUTCString()
  const local = formatDateInTimeZone(date, timeZone)
  const relative = formatRelativeTime(milliseconds - Date.now(), locale)
  const zones: TimestampZoneEntry[] = MULTI_TIMEZONES.map((z) => ({
    timeZone: z.id,
    label: z.label,
    formatted: formatDateInTimeZone(date, z.id),
  }))

  return { seconds, milliseconds, iso, rfc2822, local, relative, zones }
}

export function parseDateToTimestamp(
  input: string,
): { seconds: number; milliseconds: number; iso: string; rfc2822: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^-?\d{10}$/.test(trimmed) || /^-?\d{13}$/.test(trimmed)) {
    const info = formatTimestamp(trimmed)
    return info
      ? {
          seconds: info.seconds,
          milliseconds: info.milliseconds,
          iso: info.iso,
          rfc2822: info.rfc2822,
        }
      : null
  }

  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)
    ? trimmed.replace(/\s+/, 'T')
    : trimmed
  const ms = Date.parse(normalized)
  if (Number.isNaN(ms)) return null
  const date = new Date(ms)
  return {
    seconds: Math.trunc(ms / 1000),
    milliseconds: ms,
    iso: date.toISOString(),
    rfc2822: date.toUTCString(),
  }
}
