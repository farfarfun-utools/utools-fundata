import yaml from 'js-yaml'
import JSON5 from 'json5'
import { parse as parseToml } from 'smol-toml'

export type DataFormat =
  | 'json'
  | 'jsonc'
  | 'json5'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'ini'
  | 'ndjson'
  | 'sql'
  | 'protobuf'
  | 'text'

export type IndentOption = '2' | '4' | 'tab'

const EXT_TO_FORMAT: Record<string, DataFormat> = {
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  plist: 'xml',
  csv: 'csv',
  tsv: 'tsv',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  ndjson: 'ndjson',
  jsonl: 'ndjson',
  sql: 'sql',
  proto: 'protobuf',
  txt: 'text',
}

export function indentToString(indent: IndentOption): string {
  if (indent === 'tab') return '\t'
  if (indent === '4') return '    '
  return '  '
}

function countDelimitedColumns(line: string, delimiter: ',' | '\t'): number {
  let inQuotes = false
  let count = 1
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      count += 1
    }
  }
  return count
}

function isDelimitedTable(lines: string[], delimiter: ',' | '\t'): boolean {
  if (lines.length < 2) return false
  const sample = lines.slice(0, Math.min(lines.length, 8))
  const counts = sample.map((line) => countDelimitedColumns(line, delimiter))
  const first = counts[0]
  if (first < 2) return false
  return counts.every((count) => count === first)
}

function looksLikeNdjson(trimmed: string): boolean {
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return false
  for (const line of lines.slice(0, 20)) {
    if (!(line.startsWith('{') || line.startsWith('['))) return false
    try {
      const parsed = JSON.parse(line)
      if (parsed === null || typeof parsed !== 'object') return false
    } catch {
      return false
    }
  }
  return true
}

function hasJsonComments(input: string): boolean {
  let inString: '"' | "'" | null = null
  let escaped = false
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    const next = input[i + 1]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      continue
    }
    if (ch === '/' && (next === '/' || next === '*')) {
      return true
    }
  }
  return false
}

export function stripJsonComments(input: string): string {
  let out = ''
  let inString: '"' | "'" | null = null
  let escaped = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]

    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === inString) {
        inString = null
      }
      i += 1
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = ch
      out += ch
      i += 1
      continue
    }

    if (ch === '/' && next === '/') {
      i += 2
      while (i < input.length && input[i] !== '\n' && input[i] !== '\r') {
        i += 1
      }
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < input.length) {
        if (input[i] === '*' && input[i + 1] === '/') {
          i += 2
          break
        }
        if (input[i] === '\n') {
          out += '\n'
        }
        i += 1
      }
      continue
    }

    out += ch
    i += 1
  }

  return out
}

export function parseJsonLike(input: string): unknown {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new SyntaxError('Empty JSON input')
  }
  try {
    return JSON.parse(trimmed)
  } catch (jsonErr) {
    try {
      return JSON.parse(stripJsonComments(trimmed))
    } catch {
      try {
        return JSON5.parse(trimmed)
      } catch {
        throw jsonErr
      }
    }
  }
}

export function detectFormat(content: string, filename?: string): DataFormat {
  if (filename) {
    const base = filename.split(/[/\\]/).pop() ?? filename
    const dotIndex = base.lastIndexOf('.')
    if (dotIndex > 0 && dotIndex < base.length - 1) {
      const ext = base.slice(dotIndex + 1).toLowerCase()
      const matched = EXT_TO_FORMAT[ext]
      if (matched) return matched
    }
  }

  const trimmed = content.trim()
  if (!trimmed) return 'text'

  // XML
  if (/^<\?xml[\s?]/i.test(trimmed)) {
    return 'xml'
  }
  if (/^<[a-zA-Z][\w:-]*(?:\s[^>]*)?>[\s\S]*<\/[a-zA-Z][\w:-]*>\s*$/.test(trimmed)) {
    return 'xml'
  }

  // NDJSON (check before single JSON)
  if (looksLikeNdjson(trimmed)) {
    return 'ndjson'
  }

  // JSON / JSONC / JSON5
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // continue
    }
    if (hasJsonComments(trimmed)) {
      try {
        JSON.parse(stripJsonComments(trimmed))
        return 'jsonc'
      } catch {
        // continue
      }
    }
    try {
      JSON5.parse(trimmed)
      return hasJsonComments(trimmed) ? 'jsonc' : 'json5'
    } catch {
      // continue
    }
  } else if (hasJsonComments(trimmed)) {
    const stripped = stripJsonComments(trimmed).trim()
    if (stripped.startsWith('{') || stripped.startsWith('[')) {
      try {
        JSON.parse(stripped)
        return 'jsonc'
      } catch {
        try {
          JSON5.parse(trimmed)
          return 'jsonc'
        } catch {
          // continue
        }
      }
    }
  }

  // Protobuf
  if (
    /^\s*syntax\s*=\s*["']proto[23]["']\s*;/m.test(trimmed) ||
    (/^\s*(?:message|enum|service)\s+[A-Za-z_]\w*\s*\{/m.test(trimmed) &&
      /=\s*\d+\s*(?:\[[^\]]*\])?\s*;/m.test(trimmed))
  ) {
    return 'protobuf'
  }

  // SQL
  if (
    /^\s*(?:SELECT\b[\s\S]+\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|INDEX|DATABASE)\b|ALTER\s+TABLE\b|DROP\s+(?:TABLE|VIEW|INDEX)\b|WITH\s+\w+\s+AS\s*\()/i.test(
      trimmed,
    )
  ) {
    return 'sql'
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  // INI vs TOML
  const hasSectionOrEq =
    nonEmptyLines.some((line) => /^\[[^\]]+\]$/.test(line)) ||
    nonEmptyLines.filter(
      (line) => !line.startsWith('#') && !line.startsWith(';') && /^[A-Za-z0-9_.-]+\s*=/.test(line),
    ).length >= 2

  if (hasSectionOrEq && !/[{};]\s*$/.test(nonEmptyLines[0] ?? '')) {
    const hasIniSemicolonComment = nonEmptyLines.some((line) => line.startsWith(';'))
    if (!hasIniSemicolonComment) {
      try {
        const parsed = parseToml(trimmed)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return 'toml'
        }
      } catch {
        // likely INI
      }
    }
    const eqLines = nonEmptyLines.filter(
      (line) => !line.startsWith('#') && !line.startsWith(';') && !/^\[.+\]$/.test(line),
    )
    if (eqLines.length > 0 && eqLines.every((line) => /^[^=:]+=\s*.*$/.test(line))) {
      return 'ini'
    }
  }

  // TSV / CSV
  if (isDelimitedTable(nonEmptyLines, '\t')) {
    return 'tsv'
  }
  if (
    isDelimitedTable(nonEmptyLines, ',') &&
    !nonEmptyLines[0].includes(':') &&
    !nonEmptyLines[0].includes('{') &&
    !nonEmptyLines[0].includes(';')
  ) {
    return 'csv'
  }

  // YAML
  if (
    /^---\s*$/m.test(trimmed) ||
    nonEmptyLines.some((line) => /^[A-Za-z0-9_.-]+\s*:\s*(?:\S.*)?$/.test(line)) ||
    nonEmptyLines.every((line) => /^-\s+\S/.test(line) || line.startsWith('#'))
  ) {
    try {
      const parsed = yaml.load(trimmed)
      if (parsed !== null && typeof parsed === 'object') {
        return 'yaml'
      }
    } catch {
      // not YAML
    }
  }

  return 'text'
}
