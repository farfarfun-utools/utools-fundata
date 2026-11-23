import { formatDateInTimeZone, formatRelativeTime } from './decoders'

export interface CronFieldBreakdown {
  key: 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow'
  labelZh: string
  labelEn: string
  raw: string
  summaryZh: string
  summaryEn: string
}

export interface CronRunItem {
  index: number
  timestamp: number
  iso: string
  formatted: string
  relative: string
}

export interface CronParseResult {
  valid: boolean
  error?: string
  expression: string
  fieldCount: 5 | 6
  fields: CronFieldBreakdown[]
  descriptionZh: string
  descriptionEn: string
  timeZone: string
  nextRuns: CronRunItem[]
}

export interface CronPreset {
  id: string
  labelZh: string
  labelEn: string
  expression: string
}

export const CRON_PRESETS: CronPreset[] = [
  { id: 'every-5m', labelZh: '每 5 分钟', labelEn: 'Every 5 min', expression: '*/5 * * * *' },
  { id: 'daily-midnight', labelZh: '每日零点', labelEn: 'Daily 00:00', expression: '0 0 * * *' },
  { id: 'weekday-9am', labelZh: '工作日早 9 点', labelEn: 'Weekdays 09:00', expression: '0 9 * * 1-5' },
  { id: 'every-mon', labelZh: '每周一 9 点', labelEn: 'Mondays 09:00', expression: '0 9 * * MON' },
  { id: 'monthly-1st', labelZh: '每月 1 日零点', labelEn: '1st of Month', expression: '0 0 1 * *' },
  { id: 'every-30s', labelZh: '每 30 秒 (6位)', labelEn: 'Every 30s (6f)', expression: '*/30 * * * * *' },
]

const MONTH_ALIASES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

const DOW_ALIASES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
}

const CRON_MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

const DOW_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ParsedField {
  raw: string
  any: boolean
  values: Set<number>
  sorted: number[]
}

function parseFieldAtom(
  token: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  isDow = false,
): number {
  const upper = token.toUpperCase()
  if (aliases && aliases[upper] !== undefined) {
    return aliases[upper]
  }
  if (!/^\d+$/.test(token)) {
    throw new Error(`Invalid cron token "${token}"`)
  }
  let num = Number(token)
  if (isDow && num === 7) num = 0
  if (num < min || num > max) {
    throw new Error(`Value ${num} out of range [${min}..${max}]`)
  }
  return num
}

function parseCronField(
  raw: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  isDow = false,
): ParsedField {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Empty cron field')
  }

  const values = new Set<number>()
  const parts = trimmed.split(',')
  for (const part of parts) {
    if (!part) throw new Error(`Empty segment in "${raw}"`)
    const stepSplit = part.split('/')
    if (stepSplit.length > 2) {
      throw new Error(`Invalid step syntax "${part}"`)
    }
    const rangePart = stepSplit[0]
    let step = 1
    if (stepSplit.length === 2) {
      if (!/^\d+$/.test(stepSplit[1]) || Number(stepSplit[1]) <= 0) {
        throw new Error(`Invalid step "${stepSplit[1]}" in "${part}"`)
      }
      step = Number(stepSplit[1])
    }

    if (rangePart === '*' || rangePart === '?') {
      for (let v = min; v <= max; v += step) {
        values.add(v)
      }
      continue
    }

    if (rangePart.includes('-')) {
      const bounds = rangePart.split('-')
      if (bounds.length !== 2) {
        throw new Error(`Invalid range "${rangePart}"`)
      }
      const startRaw = parseFieldAtom(bounds[0], min, max, aliases, isDow)
      // Preserve 7 as Sunday end in range like 5-7 or FRI-SUN
      const endTokenUpper = bounds[1].toUpperCase()
      const endRaw =
        isDow && (bounds[1] === '7' || (endTokenUpper === 'SUN' && startRaw > 0))
          ? 7
          : parseFieldAtom(bounds[1], min, max, aliases, isDow)
      if (endRaw < startRaw) {
        throw new Error(`Range start ${startRaw} > end ${endRaw} in "${rangePart}"`)
      }
      for (let v = startRaw; v <= endRaw; v += step) {
        values.add(isDow && v === 7 ? 0 : v)
      }
      continue
    }

    const single = parseFieldAtom(rangePart, min, max, aliases, isDow)
    if (stepSplit.length === 2) {
      for (let v = single; v <= max; v += step) {
        values.add(v)
      }
    } else {
      values.add(single)
    }
  }

  if (values.size === 0) {
    throw new Error(`Field "${raw}" produced no valid values`)
  }

  const sorted = Array.from(values).sort((a, b) => a - b)
  const any = trimmed === '*' || trimmed === '?' || sorted.length === max - min + 1
  return { raw: trimmed, any, values, sorted }
}

function summarizeField(
  key: CronFieldBreakdown['key'],
  field: ParsedField,
  locale: 'zh' | 'en',
): string {
  const unitZh: Record<CronFieldBreakdown['key'], string> = {
    second: '秒',
    minute: '分',
    hour: '点',
    dom: '日',
    month: '月',
    dow: '',
  }
  const unitEn: Record<CronFieldBreakdown['key'], string> = {
    second: 'second',
    minute: 'minute',
    hour: 'hour',
    dom: 'day',
    month: 'month',
    dow: 'weekday',
  }

  if (field.raw === '*' || field.raw === '?') {
    return locale === 'zh' ? `每${key === 'dom' ? '天' : key === 'dow' ? '周每日' : unitZh[key]}` : `every ${unitEn[key]}`
  }

  const stepMatch = /^\*\/(\d+)$/.exec(field.raw)
  if (stepMatch) {
    const n = Number(stepMatch[1])
    return locale === 'zh'
      ? `每隔 ${n} ${key === 'dom' ? '天' : unitZh[key]}`
      : `every ${n} ${unitEn[key]}s`
  }

  if (key === 'dow') {
    const names = field.sorted.map((d) => (locale === 'zh' ? DOW_ZH[d] : DOW_EN[d]))
    if (field.sorted.length === 5 && field.sorted[0] === 1 && field.sorted[4] === 5) {
      return locale === 'zh' ? '工作日 (周一至周五)' : 'Mon–Fri'
    }
    return names.join(locale === 'zh' ? '、' : ', ')
  }

  if (field.sorted.length <= 5) {
    if (locale === 'zh') {
      return field.sorted.map((v) => `${v}${unitZh[key]}`).join('、')
    }
    return field.sorted.join(', ')
  }

  return locale === 'zh' ? `${field.raw}` : `${field.raw}`
}

function buildHumanDescription(
  fields: {
    second: ParsedField
    minute: ParsedField
    hour: ParsedField
    dom: ParsedField
    month: ParsedField
    dow: ParsedField
  },
  isSixField: boolean,
): { zh: string; en: string } {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const zhParts: string[] = []
  const enParts: string[] = []

  // Month
  if (!fields.month.any) {
    zhParts.push(`在 ${fields.month.sorted.map((m) => `${m}月`).join('、')}`)
    enParts.push(`in month ${fields.month.sorted.join(', ')}`)
  }

  // Day of month & day of week
  if (!fields.dom.any && !fields.dow.any) {
    zhParts.push(`每月 ${fields.dom.sorted.join('、')} 日或 ${summarizeField('dow', fields.dow, 'zh')}`)
    enParts.push(`on day ${fields.dom.sorted.join(', ')} or ${summarizeField('dow', fields.dow, 'en')}`)
  } else if (!fields.dom.any) {
    zhParts.push(`每月 ${fields.dom.sorted.join('、')} 日`)
    enParts.push(`on day ${fields.dom.sorted.join(', ')} of month`)
  } else if (!fields.dow.any) {
    zhParts.push(`每${summarizeField('dow', fields.dow, 'zh')}`)
    enParts.push(`on ${summarizeField('dow', fields.dow, 'en')}`)
  } else if (fields.month.any) {
    if (!fields.hour.any || (!fields.minute.any && fields.hour.sorted.length === 1)) {
      zhParts.push('每天')
      enParts.push('Every day')
    }
  }

  // Time part (hour : minute : second)
  const exactHour = fields.hour.sorted.length === 1 && !fields.hour.any
  const exactMin = fields.minute.sorted.length === 1 && !fields.minute.any
  const exactSec = fields.second.sorted.length === 1 && !fields.second.any

  if (isSixField && /^\*\/(\d+)$/.test(fields.second.raw) && fields.minute.any && fields.hour.any) {
    const step = Number(fields.second.raw.slice(2))
    zhParts.push(`每隔 ${step} 秒`)
    enParts.push(`every ${step} seconds`)
  } else if (!isSixField && /^\*\/(\d+)$/.test(fields.minute.raw) && fields.hour.any) {
    const step = Number(fields.minute.raw.slice(2))
    zhParts.push(`每隔 ${step} 分钟`)
    enParts.push(`every ${step} minutes`)
  } else if (exactHour && exactMin) {
    const h = pad2(fields.hour.sorted[0])
    const m = pad2(fields.minute.sorted[0])
    const s = isSixField && exactSec ? `:${pad2(fields.second.sorted[0])}` : ''
    zhParts.push(`${h}:${m}${s} 执行`)
    enParts.push(`at ${h}:${m}${s}`)
  } else {
    if (!fields.hour.any) {
      zhParts.push(`${summarizeField('hour', fields.hour, 'zh')}`)
      enParts.push(`at hour ${summarizeField('hour', fields.hour, 'en')}`)
    } else if (fields.minute.any && (!isSixField || fields.second.any)) {
      zhParts.push(isSixField ? '每秒' : '每分钟')
      enParts.push(isSixField ? 'every second' : 'every minute')
    }

    if (!fields.minute.any) {
      zhParts.push(`第 ${summarizeField('minute', fields.minute, 'zh')}`)
      enParts.push(`at minute ${summarizeField('minute', fields.minute, 'en')}`)
    } else if (!fields.hour.any) {
      zhParts.push('每分钟')
      enParts.push('every minute')
    }

    if (isSixField && !fields.second.any && !(fields.second.sorted.length === 1 && fields.second.sorted[0] === 0)) {
      zhParts.push(`第 ${summarizeField('second', fields.second, 'zh')}`)
      enParts.push(`at second ${summarizeField('second', fields.second, 'en')}`)
    }
  }

  const zh = zhParts.join(' ') + (zhParts[zhParts.length - 1]?.endsWith('执行') ? '' : '执行')
  const enRaw = enParts.join(', ')
  const en = enRaw ? enRaw.charAt(0).toUpperCase() + enRaw.slice(1) : 'Every minute'
  return { zh, en }
}

interface WallClock {
  year: number
  month: number // 1..12
  day: number // 1..31
  hour: number // 0..23
  minute: number // 0..59
  second: number // 0..59
}

function getTimeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function dateToWallClock(date: Date, formatter: Intl.DateTimeFormat): WallClock {
  const parts = formatter.formatToParts(date)
  const map: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value)
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  }
}

function wallClockToEpochMs(wc: WallClock, formatter: Intl.DateTimeFormat): number {
  const utcGuess = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second)
  const actual1 = dateToWallClock(new Date(utcGuess), formatter)
  const actual1AsUtc = Date.UTC(
    actual1.year,
    actual1.month - 1,
    actual1.day,
    actual1.hour,
    actual1.minute,
    actual1.second,
  )
  const offset1 = actual1AsUtc - utcGuess
  const candidate = utcGuess - offset1

  // Second pass handles DST boundaries accurately
  const actual2 = dateToWallClock(new Date(candidate), formatter)
  const actual2AsUtc = Date.UTC(
    actual2.year,
    actual2.month - 1,
    actual2.day,
    actual2.hour,
    actual2.minute,
    actual2.second,
  )
  const offset2 = actual2AsUtc - candidate
  return utcGuess - offset2
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function nextGreaterOrEqual(sorted: number[], target: number): number | null {
  for (const v of sorted) {
    if (v >= target) return v
  }
  return null
}

function matchesDay(
  year: number,
  month: number,
  day: number,
  dom: ParsedField,
  dow: ParsedField,
): boolean {
  const domMatch = dom.values.has(day)
  const dowMatch = dow.values.has(dayOfWeek(year, month, day))
  if (dom.any && dow.any) return true
  if (dom.any) return dowMatch
  if (dow.any) return domMatch
  // Standard Vixie cron semantics: when both dom & dow are restricted, either matches
  return domMatch || dowMatch
}

function computeNextRuns(
  fields: {
    second: ParsedField
    minute: ParsedField
    hour: ParsedField
    dom: ParsedField
    month: ParsedField
    dow: ParsedField
  },
  count: number,
  timeZone: string,
  fromDate: Date,
  locale: 'zh-CN' | 'en' = 'en',
): CronRunItem[] {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = getTimeZoneFormatter(timeZone)
  } catch {
    formatter = getTimeZoneFormatter('UTC')
  }

  const startMs = fromDate.getTime()
  const baseDate = new Date(Math.floor(startMs / 1000) * 1000 + 1000)
  const cursor: WallClock = dateToWallClock(baseDate, formatter)

  const runs: CronRunItem[] = []
  const maxYear = cursor.year + 8
  let safety = 0

  while (runs.length < count && cursor.year <= maxYear && safety < 20000) {
    safety += 1

    // 1. Month
    const nextMonth = nextGreaterOrEqual(fields.month.sorted, cursor.month)
    if (nextMonth === null) {
      cursor.year += 1
      cursor.month = fields.month.sorted[0]
      cursor.day = 1
      cursor.hour = fields.hour.sorted[0]
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }
    if (nextMonth !== cursor.month) {
      cursor.month = nextMonth
      cursor.day = 1
      cursor.hour = fields.hour.sorted[0]
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }

    // 2. Day (dom/dow)
    const maxDom = daysInMonth(cursor.year, cursor.month)
    if (cursor.day > maxDom) {
      cursor.month += 1
      if (cursor.month > 12) {
        cursor.year += 1
        cursor.month = 1
      }
      cursor.day = 1
      cursor.hour = fields.hour.sorted[0]
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }
    if (!matchesDay(cursor.year, cursor.month, cursor.day, fields.dom, fields.dow)) {
      cursor.day += 1
      cursor.hour = fields.hour.sorted[0]
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }

    // 3. Hour
    const nextHour = nextGreaterOrEqual(fields.hour.sorted, cursor.hour)
    if (nextHour === null) {
      cursor.day += 1
      cursor.hour = fields.hour.sorted[0]
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }
    if (nextHour !== cursor.hour) {
      cursor.hour = nextHour
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }

    // 4. Minute
    const nextMinute = nextGreaterOrEqual(fields.minute.sorted, cursor.minute)
    if (nextMinute === null) {
      cursor.hour += 1
      if (cursor.hour > 23) {
        cursor.day += 1
        cursor.hour = fields.hour.sorted[0]
      }
      cursor.minute = fields.minute.sorted[0]
      cursor.second = fields.second.sorted[0]
      continue
    }
    if (nextMinute !== cursor.minute) {
      cursor.minute = nextMinute
      cursor.second = fields.second.sorted[0]
      continue
    }

    // 5. Second
    const nextSecond = nextGreaterOrEqual(fields.second.sorted, cursor.second)
    if (nextSecond === null) {
      cursor.minute += 1
      if (cursor.minute > 59) {
        cursor.hour += 1
        cursor.minute = fields.minute.sorted[0]
        if (cursor.hour > 23) {
          cursor.day += 1
          cursor.hour = fields.hour.sorted[0]
        }
      }
      cursor.second = fields.second.sorted[0]
      continue
    }
    if (nextSecond !== cursor.second) {
      cursor.second = nextSecond
      continue
    }

    // Exact match!
    const epochMs = wallClockToEpochMs(cursor, formatter)
    const runDate = new Date(epochMs)
    if (epochMs > startMs) {
      runs.push({
        index: runs.length + 1,
        timestamp: epochMs,
        iso: runDate.toISOString(),
        formatted: formatDateInTimeZone(runDate, timeZone),
        relative: formatRelativeTime(epochMs - startMs, locale),
      })
    }

    // Advance by 1 second
    cursor.second += 1
    if (cursor.second > 59) {
      cursor.second = 0
      cursor.minute += 1
      if (cursor.minute > 59) {
        cursor.minute = 0
        cursor.hour += 1
        if (cursor.hour > 23) {
          cursor.hour = 0
          cursor.day += 1
        }
      }
    }
  }

  return runs
}

export function isLikelyCronExpression(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed || trimmed.includes('\n')) return false
  if (CRON_MACROS[trimmed.toLowerCase()]) return true
  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) return false
  if (!parts.every((p) => /^[\d*,/?A-Za-z-]+$/.test(p))) return false
  const res = parseCron(trimmed, { count: 1 })
  return res.valid
}

export function parseCron(
  expression: string,
  options?: { count?: number; timeZone?: string; fromDate?: Date; locale?: 'zh-CN' | 'en' },
): CronParseResult {
  const trimmed = expression.trim()
  const expanded = CRON_MACROS[trimmed.toLowerCase()] ?? trimmed
  const timeZone = options?.timeZone || 'Asia/Shanghai'
  const count = Math.max(1, Math.min(20, Math.floor(options?.count ?? 10)))
  const fromDate = options?.fromDate ?? new Date()
  const locale = options?.locale ?? 'en'

  if (!trimmed) {
    return {
      valid: false,
      error: 'Cron expression cannot be empty',
      expression: trimmed,
      fieldCount: 5,
      fields: [],
      descriptionZh: '',
      descriptionEn: '',
      timeZone,
      nextRuns: [],
    }
  }

  const tokens = expanded.split(/\s+/)
  if (tokens.length !== 5 && tokens.length !== 6) {
    return {
      valid: false,
      error: `Expected 5 or 6 fields, got ${tokens.length}`,
      expression: trimmed,
      fieldCount: 5,
      fields: [],
      descriptionZh: '',
      descriptionEn: '',
      timeZone,
      nextRuns: [],
    }
  }

  const isSix = tokens.length === 6
  const [secRaw, minRaw, hourRaw, domRaw, monthRaw, dowRaw] = isSix
    ? tokens
    : ['0', tokens[0], tokens[1], tokens[2], tokens[3], tokens[4]]

  try {
    const second = parseCronField(secRaw, 0, 59)
    const minute = parseCronField(minRaw, 0, 59)
    const hour = parseCronField(hourRaw, 0, 23)
    const dom = parseCronField(domRaw, 1, 31)
    const month = parseCronField(monthRaw, 1, 12, MONTH_ALIASES)
    const dow = parseCronField(dowRaw, 0, 6, DOW_ALIASES, true)

    const fieldMap = { second, minute, hour, dom, month, dow }
    const breakdown: CronFieldBreakdown[] = []
    if (isSix) {
      breakdown.push({
        key: 'second',
        labelZh: '秒',
        labelEn: 'Second',
        raw: secRaw,
        summaryZh: summarizeField('second', second, 'zh'),
        summaryEn: summarizeField('second', second, 'en'),
      })
    }
    breakdown.push(
      {
        key: 'minute',
        labelZh: '分',
        labelEn: 'Minute',
        raw: minRaw,
        summaryZh: summarizeField('minute', minute, 'zh'),
        summaryEn: summarizeField('minute', minute, 'en'),
      },
      {
        key: 'hour',
        labelZh: '时',
        labelEn: 'Hour',
        raw: hourRaw,
        summaryZh: summarizeField('hour', hour, 'zh'),
        summaryEn: summarizeField('hour', hour, 'en'),
      },
      {
        key: 'dom',
        labelZh: '日',
        labelEn: 'Day',
        raw: domRaw,
        summaryZh: summarizeField('dom', dom, 'zh'),
        summaryEn: summarizeField('dom', dom, 'en'),
      },
      {
        key: 'month',
        labelZh: '月',
        labelEn: 'Month',
        raw: monthRaw,
        summaryZh: summarizeField('month', month, 'zh'),
        summaryEn: summarizeField('month', month, 'en'),
      },
      {
        key: 'dow',
        labelZh: '周',
        labelEn: 'Weekday',
        raw: dowRaw,
        summaryZh: summarizeField('dow', dow, 'zh'),
        summaryEn: summarizeField('dow', dow, 'en'),
      },
    )

    const desc = buildHumanDescription(fieldMap, isSix)
    const nextRuns = computeNextRuns(fieldMap, count, timeZone, fromDate, locale)

    return {
      valid: true,
      expression: trimmed,
      fieldCount: isSix ? 6 : 5,
      fields: breakdown,
      descriptionZh: desc.zh,
      descriptionEn: desc.en,
      timeZone,
      nextRuns,
    }
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid cron expression',
      expression: trimmed,
      fieldCount: isSix ? 6 : 5,
      fields: [],
      descriptionZh: '',
      descriptionEn: '',
      timeZone,
      nextRuns: [],
    }
  }
}
