import { convertFormat, CONVERT_FORMATS, type ConvertFormat } from './converter'
import { parseCron, type CronFieldBreakdown, type CronRunItem } from './cron'
import {
  computeSingleHash,
  type HashAlgorithm,
  type HashEncoding,
} from './crypto'
import { decodeJwt } from './jwt'
import {
  formatSqlCode,
  minifySqlCode,
  SQL_DIALECTS,
  type SqlDialect,
  type SqlKeywordCase,
} from './sql'

export interface ToolResultBase {
  ok: boolean
  error?: string
}

const VALID_CONVERT_FORMATS = new Set<string>(CONVERT_FORMATS.map((f) => f.id))
const VALID_SQL_DIALECTS = new Set<string>(SQL_DIALECTS.map((d) => d.id))
const VALID_HASH_ALGS = new Set<string>(['md5', 'sha1', 'sha256', 'sha384', 'sha512'])
const VALID_HASH_ENCODINGS = new Set<string>(['hex', 'HEX', 'base64'])

function asRecord(params: unknown): Record<string, unknown> | null {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return null
  }
  return params as Record<string, unknown>
}

export function convertDataFormatTool(params: unknown): ToolResultBase & {
  output?: string
  detectedFrom?: ConvertFormat
  to?: ConvertFormat
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.input !== 'string' || !rec.input.trim()) {
    return { ok: false, error: 'Parameter "input" must be a non-empty string' }
  }
  if (typeof rec.to !== 'string' || !VALID_CONVERT_FORMATS.has(rec.to)) {
    return {
      ok: false,
      error:
        'Parameter "to" must be one of json, json5, yaml, toml, xml, csv, tsv, ini, ndjson, query',
    }
  }
  const fromRaw = rec.from === undefined ? 'auto' : rec.from
  if (
    typeof fromRaw !== 'string' ||
    (fromRaw !== 'auto' && !VALID_CONVERT_FORMATS.has(fromRaw))
  ) {
    return {
      ok: false,
      error: 'Parameter "from" must be "auto" or a valid data format',
    }
  }

  try {
    const result = convertFormat(
      rec.input,
      fromRaw as ConvertFormat | 'auto',
      rec.to as ConvertFormat,
      '2',
    )
    return {
      ok: true,
      output: result.output,
      detectedFrom: result.detectedFrom,
      to: rec.to as ConvertFormat,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Format conversion failed',
    }
  }
}

export function decodeJwtTool(params: unknown): ToolResultBase & {
  header?: Record<string, unknown>
  payload?: Record<string, unknown>
  signature?: string
  algorithm?: string
  status?: string
  issuedAt?: string
  notBefore?: string
  expiresAt?: string
  expiresIn?: string
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.token !== 'string' || !rec.token.trim()) {
    return { ok: false, error: 'Parameter "token" must be a non-empty string' }
  }

  try {
    const decoded = decodeJwt(rec.token)
    return {
      ok: true,
      header: decoded.header,
      payload: decoded.payload,
      signature: decoded.signature,
      algorithm: decoded.algorithm,
      status: decoded.status,
      issuedAt: decoded.issuedAt,
      notBefore: decoded.notBefore,
      expiresAt: decoded.expiresAt,
      expiresIn: decoded.expiresIn,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JWT token',
    }
  }
}

export function formatSqlTool(params: unknown): ToolResultBase & {
  output?: string
  dialect?: SqlDialect
  mode?: 'format' | 'minify'
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.input !== 'string' || !rec.input.trim()) {
    return { ok: false, error: 'Parameter "input" must be a non-empty string' }
  }

  const dialect = rec.dialect === undefined ? 'sql' : rec.dialect
  if (typeof dialect !== 'string' || !VALID_SQL_DIALECTS.has(dialect)) {
    return {
      ok: false,
      error: 'Parameter "dialect" must be one of sql, mysql, postgresql, sqlite, bigquery, tsql',
    }
  }

  const keywordCase = rec.keywordCase === undefined ? 'upper' : rec.keywordCase
  if (keywordCase !== 'upper' && keywordCase !== 'lower' && keywordCase !== 'preserve') {
    return { ok: false, error: 'Parameter "keywordCase" must be "upper", "lower", or "preserve"' }
  }

  const mode = rec.mode === undefined ? 'format' : rec.mode
  if (mode !== 'format' && mode !== 'minify') {
    return { ok: false, error: 'Parameter "mode" must be "format" or "minify"' }
  }

  let indent = 2
  if (rec.indent !== undefined) {
    if (rec.indent !== 2 && rec.indent !== 4) {
      return { ok: false, error: 'Parameter "indent" must be 2 or 4' }
    }
    indent = rec.indent
  }

  try {
    const output =
      mode === 'minify'
        ? minifySqlCode(rec.input)
        : formatSqlCode(rec.input, {
            dialect: dialect as SqlDialect,
            keywordCase: keywordCase as SqlKeywordCase,
            tabWidth: indent,
          })
    return { ok: true, output, dialect: dialect as SqlDialect, mode }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'SQL formatting failed',
    }
  }
}

export function parseCronTool(params: unknown): ToolResultBase & {
  fieldCount?: 5 | 6
  descriptionZh?: string
  descriptionEn?: string
  timeZone?: string
  fields?: CronFieldBreakdown[]
  nextRuns?: CronRunItem[]
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.expression !== 'string' || !rec.expression.trim()) {
    return { ok: false, error: 'Parameter "expression" must be a non-empty string' }
  }

  let count = 10
  if (rec.count !== undefined) {
    if (
      typeof rec.count !== 'number' ||
      !Number.isInteger(rec.count) ||
      rec.count < 1 ||
      rec.count > 20
    ) {
      return { ok: false, error: 'Parameter "count" must be an integer between 1 and 20' }
    }
    count = rec.count
  }

  const timeZone =
    rec.timeZone === undefined
      ? 'Asia/Shanghai'
      : typeof rec.timeZone === 'string' && rec.timeZone.trim()
        ? rec.timeZone.trim()
        : null
  if (!timeZone) {
    return { ok: false, error: 'Parameter "timeZone" must be a non-empty string' }
  }

  const res = parseCron(rec.expression, { count, timeZone })
  if (!res.valid) {
    return { ok: false, error: res.error ?? 'Invalid cron expression' }
  }

  return {
    ok: true,
    fieldCount: res.fieldCount,
    descriptionZh: res.descriptionZh,
    descriptionEn: res.descriptionEn,
    timeZone: res.timeZone,
    fields: res.fields,
    nextRuns: res.nextRuns,
  }
}

export async function computeHashTool(params: unknown): Promise<
  ToolResultBase & {
    algorithm?: HashAlgorithm
    hmac?: boolean
    encoding?: HashEncoding
    digest?: string
  }
> {
  const rec = asRecord(params)
  if (!rec || typeof rec.input !== 'string') {
    return { ok: false, error: 'Parameter "input" must be a string' }
  }

  const algorithm = rec.algorithm === undefined ? 'sha256' : rec.algorithm
  if (typeof algorithm !== 'string' || !VALID_HASH_ALGS.has(algorithm)) {
    return {
      ok: false,
      error: 'Parameter "algorithm" must be one of md5, sha1, sha256, sha384, sha512',
    }
  }

  const encoding = rec.encoding === undefined ? 'hex' : rec.encoding
  if (typeof encoding !== 'string' || !VALID_HASH_ENCODINGS.has(encoding)) {
    return { ok: false, error: 'Parameter "encoding" must be "hex", "HEX", or "base64"' }
  }

  if (rec.hmacKey !== undefined && typeof rec.hmacKey !== 'string') {
    return { ok: false, error: 'Parameter "hmacKey" must be a string' }
  }

  try {
    const hmacKey = rec.hmacKey || undefined
    const digest = await computeSingleHash(rec.input, algorithm as HashAlgorithm, {
      hmacKey,
      encoding: encoding as HashEncoding,
    })
    return {
      ok: true,
      algorithm: algorithm as HashAlgorithm,
      hmac: Boolean(hmacKey),
      encoding: encoding as HashEncoding,
      digest,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Hash computation failed',
    }
  }
}

export const FUNDATA_AI_TOOL_HANDLERS = {
  convert_data_format: convertDataFormatTool,
  decode_jwt: decodeJwtTool,
  format_sql: formatSqlTool,
  parse_cron: parseCronTool,
  compute_hash: computeHashTool,
} as const

export function registerFunDataAiTools(): string[] {
  const api = typeof window !== 'undefined' ? window.utools : undefined
  if (!api || typeof api.registerTool !== 'function') {
    return []
  }
  const registered: string[] = []
  for (const [name, handler] of Object.entries(FUNDATA_AI_TOOL_HANDLERS)) {
    api.registerTool(name, handler)
    registered.push(name)
  }
  return registered
}
