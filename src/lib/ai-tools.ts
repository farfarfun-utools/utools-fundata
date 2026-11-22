import { convertFormat, CONVERT_FORMATS, type ConvertFormat } from './converter'
import {
  minifyContent,
  parseJsonLike,
  repairJsonLocal,
  sortJsonKeys,
} from './formats'
import { runJsonPath } from './jsonpath'
import { decodeJwt } from './jwt'
import { generateTypes, TARGET_LANGUAGES, type TargetLanguage } from './typegen'

export interface ToolResultBase {
  ok: boolean
  error?: string
}

const VALID_CONVERT_FORMATS = new Set<string>(CONVERT_FORMATS.map((f) => f.id))
const VALID_TARGET_LANGUAGES = new Set<string>(TARGET_LANGUAGES.map((l) => l.id))

function asRecord(params: unknown): Record<string, unknown> | null {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return null
  }
  return params as Record<string, unknown>
}

export function formatJsonTool(params: unknown): ToolResultBase & {
  output?: string
  repaired?: boolean
  mode?: 'format' | 'minify'
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.input !== 'string' || !rec.input.trim()) {
    return { ok: false, error: 'Parameter "input" must be a non-empty string' }
  }

  const mode = rec.mode === undefined ? 'format' : rec.mode
  if (mode !== 'format' && mode !== 'minify') {
    return { ok: false, error: 'Parameter "mode" must be "format" or "minify"' }
  }

  let indentSpaces = 2
  if (rec.indent !== undefined) {
    if (
      typeof rec.indent !== 'number' ||
      !Number.isInteger(rec.indent) ||
      rec.indent < 1 ||
      rec.indent > 8
    ) {
      return { ok: false, error: 'Parameter "indent" must be an integer between 1 and 8' }
    }
    indentSpaces = rec.indent
  }

  const repair = rec.repair === undefined ? true : rec.repair
  if (typeof repair !== 'boolean') {
    return { ok: false, error: 'Parameter "repair" must be a boolean' }
  }

  const sortKeys = rec.sortKeys === undefined ? 'none' : rec.sortKeys
  if (sortKeys !== 'none' && sortKeys !== 'asc' && sortKeys !== 'desc') {
    return { ok: false, error: 'Parameter "sortKeys" must be "none", "asc", or "desc"' }
  }

  let working = rec.input
  let repaired = false

  try {
    parseJsonLike(working)
  } catch (parseErr) {
    if (!repair) {
      return {
        ok: false,
        error: parseErr instanceof Error ? parseErr.message : 'Invalid JSON input',
      }
    }
    try {
      const fixed = repairJsonLocal(working)
      working = fixed.output
      repaired = fixed.changed
    } catch (repairErr) {
      return {
        ok: false,
        error: repairErr instanceof Error ? repairErr.message : 'Failed to repair JSON input',
      }
    }
  }

  try {
    if (sortKeys !== 'none') {
      working = sortJsonKeys(working, sortKeys, '2')
    }
    const output =
      mode === 'minify'
        ? minifyContent(working, 'json')
        : JSON.stringify(parseJsonLike(working), null, ' '.repeat(indentSpaces))

    return { ok: true, output, repaired, mode }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to format JSON',
    }
  }
}

export function queryJsonPathTool(params: unknown): ToolResultBase & {
  results?: unknown[]
  paths?: string[]
  count?: number
  formatted?: string
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.input !== 'string' || !rec.input.trim()) {
    return { ok: false, error: 'Parameter "input" must be a non-empty string' }
  }
  if (typeof rec.expression !== 'string' || !rec.expression.trim()) {
    return { ok: false, error: 'Parameter "expression" must be a non-empty string' }
  }

  const res = runJsonPath(rec.input, rec.expression)
  if (res.error) {
    return { ok: false, error: res.error }
  }
  return {
    ok: true,
    results: res.results,
    paths: res.paths,
    count: res.count,
    formatted: res.formatted,
  }
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
      error: 'Parameter "to" must be one of json, json5, yaml, toml, xml, csv, tsv, ini, ndjson, query',
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

export function jsonToTypesTool(params: unknown): ToolResultBase & {
  output?: string
  language?: TargetLanguage
  rootName?: string
} {
  const rec = asRecord(params)
  if (!rec || typeof rec.input !== 'string' || !rec.input.trim()) {
    return { ok: false, error: 'Parameter "input" must be a non-empty string' }
  }
  if (typeof rec.language !== 'string' || !VALID_TARGET_LANGUAGES.has(rec.language)) {
    return {
      ok: false,
      error:
        'Parameter "language" must be one of typescript, go, java, rust, python, kotlin, swift, csharp, jsonschema',
    }
  }
  if (rec.rootName !== undefined && typeof rec.rootName !== 'string') {
    return { ok: false, error: 'Parameter "rootName" must be a string' }
  }

  const rootName = rec.rootName?.trim() || 'Root'
  try {
    const output = generateTypes(rec.input, rec.language as TargetLanguage, rootName)
    return {
      ok: true,
      output,
      language: rec.language as TargetLanguage,
      rootName,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Type generation failed',
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

export const FUNDATA_AI_TOOL_HANDLERS = {
  format_json: formatJsonTool,
  query_jsonpath: queryJsonPathTool,
  convert_data_format: convertDataFormatTool,
  json_to_types: jsonToTypesTool,
  decode_jwt: decodeJwtTool,
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
