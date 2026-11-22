import yaml from 'js-yaml'
import JSON5 from 'json5'
import { jsonrepair } from 'jsonrepair'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { format as formatSql } from 'sql-formatter'

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
  | 'html'
  | 'css'
  | 'javascript'
  | 'typescript'
  | 'markdown'
  | 'text'

export type IndentOption = '2' | '4' | 'tab'

export interface DataFormatMeta {
  id: DataFormat
  label: string
  shortLabel: string
  ext: string
  supportsFormat: boolean
  isJsonLike: boolean
}

export const DATA_FORMATS: DataFormatMeta[] = [
  { id: 'json', label: 'JSON', shortLabel: 'JSON', ext: 'json', supportsFormat: true, isJsonLike: true },
  { id: 'jsonc', label: 'JSONC', shortLabel: 'JSONC', ext: 'jsonc', supportsFormat: true, isJsonLike: true },
  { id: 'json5', label: 'JSON5', shortLabel: 'JSON5', ext: 'json5', supportsFormat: true, isJsonLike: true },
  { id: 'yaml', label: 'YAML', shortLabel: 'YAML', ext: 'yaml', supportsFormat: true, isJsonLike: false },
  { id: 'toml', label: 'TOML', shortLabel: 'TOML', ext: 'toml', supportsFormat: true, isJsonLike: false },
  { id: 'xml', label: 'XML', shortLabel: 'XML', ext: 'xml', supportsFormat: true, isJsonLike: false },
  { id: 'csv', label: 'CSV', shortLabel: 'CSV', ext: 'csv', supportsFormat: true, isJsonLike: false },
  { id: 'tsv', label: 'TSV', shortLabel: 'TSV', ext: 'tsv', supportsFormat: true, isJsonLike: false },
  { id: 'ini', label: 'INI', shortLabel: 'INI', ext: 'ini', supportsFormat: true, isJsonLike: false },
  { id: 'ndjson', label: 'NDJSON', shortLabel: 'NDJSON', ext: 'ndjson', supportsFormat: true, isJsonLike: false },
  { id: 'sql', label: 'SQL', shortLabel: 'SQL', ext: 'sql', supportsFormat: true, isJsonLike: false },
  { id: 'protobuf', label: 'Protobuf', shortLabel: 'Proto', ext: 'proto', supportsFormat: true, isJsonLike: false },
  { id: 'html', label: 'HTML', shortLabel: 'HTML', ext: 'html', supportsFormat: true, isJsonLike: false },
  { id: 'css', label: 'CSS', shortLabel: 'CSS', ext: 'css', supportsFormat: true, isJsonLike: false },
  { id: 'javascript', label: 'JavaScript', shortLabel: 'JS', ext: 'js', supportsFormat: true, isJsonLike: false },
  { id: 'typescript', label: 'TypeScript', shortLabel: 'TS', ext: 'ts', supportsFormat: true, isJsonLike: false },
  { id: 'markdown', label: 'Markdown', shortLabel: 'MD', ext: 'md', supportsFormat: false, isJsonLike: false },
  { id: 'text', label: 'Plain Text', shortLabel: 'TXT', ext: 'txt', supportsFormat: false, isJsonLike: false },
]

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
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
}

export function getFormatMeta(format: DataFormat): DataFormatMeta {
  return DATA_FORMATS.find((item) => item.id === format) ?? DATA_FORMATS[0]
}

export function indentToString(indent: IndentOption): string {
  if (indent === 'tab') return '\t'
  if (indent === '4') return '    '
  return '  '
}

function isDelimitedTable(lines: string[], delimiter: ',' | '\t'): boolean {
  if (lines.length < 2) return false
  const sample = lines.slice(0, Math.min(lines.length, 8))
  const counts = sample.map((line) => countDelimitedColumns(line, delimiter))
  const first = counts[0]
  if (first < 2) return false
  return counts.every((count) => count === first)
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
  if (!trimmed) return 'json'

  // HTML / XML
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return 'html'
  }
  if (/^<\?xml[\s?]/i.test(trimmed)) {
    return 'xml'
  }
  if (/^<[a-zA-Z][\w:-]*(?:\s[^>]*)?>[\s\S]*<\/[a-zA-Z][\w:-]*>\s*$/.test(trimmed)) {
    if (/<(?:div|span|p|body|head|script|style|section|main|header|footer|ul|li|h[1-6])\b/i.test(trimmed)) {
      return 'html'
    }
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
      // continue to JSONC / JSON5 checks
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
    nonEmptyLines.filter((line) => !line.startsWith('#') && !line.startsWith(';') && /^[A-Za-z0-9_.-]+\s*=/.test(line))
      .length >= 2

  if (hasSectionOrEq && !/[{};]\s*$/.test(nonEmptyLines[0] ?? '')) {
    const hasIniSemicolonComment = nonEmptyLines.some((line) => line.startsWith(';'))
    if (!hasIniSemicolonComment) {
      try {
        const parsed = parseToml(trimmed)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return 'toml'
        }
      } catch {
        // likely INI (e.g. unquoted strings)
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

  // TypeScript / JavaScript
  if (
    /^\s*(?:export\s+)?(?:interface|type)\s+[A-Z]\w*/m.test(trimmed) ||
    /:\s*(?:string|number|boolean|unknown|Record<|Array<)/m.test(trimmed)
  ) {
    return 'typescript'
  }
  if (
    /^\s*(?:import\s+.+\s+from\s+['"]|export\s+(?:default\s+)?(?:function|const|class)\b|const\s+\w+\s*=|function\s+\w+\s*\()/m.test(
      trimmed,
    )
  ) {
    return 'javascript'
  }

  // CSS
  if (/^[.#@a-zA-Z*][\w\s.,#:>+~[\]="'()-]*\{\s*[\w-]+\s*:\s*[^;{}]+;/m.test(trimmed)) {
    return 'css'
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

  // Markdown
  if (/^#{1,6}\s+\S/m.test(trimmed) || /^```/m.test(trimmed) || /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(trimmed)) {
    return 'markdown'
  }

  return 'text'
}

export function detectIndent(content: string): IndentOption {
  const lines = content.split(/\r?\n/)
  let tabCount = 0
  let twoSpaceCount = 0
  let fourSpaceCount = 0

  for (const line of lines) {
    if (!line.trim()) continue
    if (line.startsWith('\t')) {
      tabCount += 1
      continue
    }
    const match = /^( +)\S/.exec(line)
    if (!match) continue
    const spaces = match[1].length
    if (spaces === 2) {
      twoSpaceCount += 2
    } else if (spaces === 4) {
      fourSpaceCount += 1
    } else if (spaces % 4 === 0) {
      fourSpaceCount += 1
    } else if (spaces % 2 === 0) {
      twoSpaceCount += 1
    }
  }

  if (tabCount > 0 && tabCount >= twoSpaceCount && tabCount >= fourSpaceCount) {
    return 'tab'
  }
  if (fourSpaceCount > 0 && twoSpaceCount === 0) {
    return '4'
  }
  return '2'
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

function offsetToLineColumn(input: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, input.length))
  let line = 1
  let column = 1
  for (let i = 0; i < clamped; i += 1) {
    if (input[i] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

export function parseJsonError(input: string): {
  valid: boolean
  message?: string
  line?: number
  column?: number
} {
  if (!input.trim()) {
    return { valid: false, message: 'Empty JSON input', line: 1, column: 1 }
  }
  try {
    JSON.parse(input)
    return { valid: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const lineColMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message)
    if (lineColMatch) {
      return {
        valid: false,
        message,
        line: Number(lineColMatch[1]),
        column: Number(lineColMatch[2]),
      }
    }
    const posMatch = /position\s+(\d+)/i.exec(message)
    if (posMatch) {
      const { line, column } = offsetToLineColumn(input, Number(posMatch[1]))
      return { valid: false, message, line, column }
    }
    // Fallback: ask JSON5 parser for lineNumber/columnNumber if available
    try {
      JSON5.parse(input)
    } catch (err5: unknown) {
      const maybe = err5 as { lineNumber?: number; columnNumber?: number }
      if (typeof maybe?.lineNumber === 'number') {
        return {
          valid: false,
          message,
          line: maybe.lineNumber,
          column: typeof maybe.columnNumber === 'number' ? maybe.columnNumber : 1,
        }
      }
    }
    return { valid: false, message, line: 1, column: 1 }
  }
}

function formatXmlString(input: string, indentStr: string): string {
  const tokens: string[] = []
  const regex = /(<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input)) !== null) {
    const raw = match[0]
    if (raw.startsWith('<')) {
      tokens.push(raw.trim())
    } else {
      const text = raw.trim()
      if (text) tokens.push(text)
    }
  }

  const lines: string[] = []
  let depth = 0

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    const next = tokens[i + 1]
    const next2 = tokens[i + 2]

    if (token.startsWith('</')) {
      depth = Math.max(0, depth - 1)
      lines.push(`${indentStr.repeat(depth)}${token}`)
    } else if (
      token.startsWith('<?') ||
      token.startsWith('<!') ||
      token.endsWith('/>')
    ) {
      lines.push(`${indentStr.repeat(depth)}${token}`)
    } else if (token.startsWith('<')) {
      // Inline <tag>text</tag> on a single line when simple text node
      const tagNameMatch = /^<([A-Za-z_][\w:.-]*)/.exec(token)
      const tagName = tagNameMatch?.[1]
      if (
        tagName &&
        next &&
        !next.startsWith('<') &&
        next2 === `</${tagName}>`
      ) {
        lines.push(`${indentStr.repeat(depth)}${token}${next}${next2}`)
        i += 2
      } else {
        lines.push(`${indentStr.repeat(depth)}${token}`)
        depth += 1
      }
    } else {
      lines.push(`${indentStr.repeat(depth)}${token}`)
    }
  }

  return lines.join('\n')
}

function formatBraceLanguage(input: string, indentStr: string): string {
  const rawLines = input.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let depth = 0

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('')
      }
      continue
    }

    const startsWithClose = trimmed.startsWith('}')
    if (startsWithClose) {
      depth = Math.max(0, depth - 1)
    }

    out.push(`${indentStr.repeat(depth)}${trimmed}`)

    // Count net braces outside strings and single-line comments
    const withoutLineComment = trimmed.replace(/\/\/.*$/, '')
    let opens = 0
    let closes = 0
    let inQuote: '"' | "'" | null = null
    let escaped = false
    for (const ch of withoutLineComment) {
      if (inQuote) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === inQuote) inQuote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch
      } else if (ch === '{') {
        opens += 1
      } else if (ch === '}') {
        closes += 1
      }
    }

    const net = opens - (startsWithClose ? Math.max(0, closes - 1) : closes)
    depth = Math.max(0, depth + net)
  }

  return out.join('\n').trimEnd()
}

function normalizeIndentation(input: string, indentStr: string): string {
  const sourceIndent = detectIndent(input)
  const sourceUnit = sourceIndent === 'tab' ? '\t' : sourceIndent === '4' ? '    ' : '  '
  return input
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const trimmedEnd = line.replace(/[ \t]+$/, '')
      const leadingMatch = /^([ \t]+)/.exec(trimmedEnd)
      if (!leadingMatch) return trimmedEnd
      const leading = leadingMatch[1]
      const rest = trimmedEnd.slice(leading.length)
      let level = 0
      if (sourceUnit === '\t') {
        level = leading.split('\t').length - 1
        const leftoverSpaces = leading.replace(/\t/g, '').length
        level += Math.floor(leftoverSpaces / 2)
      } else {
        const expanded = leading.replace(/\t/g, sourceUnit)
        level = Math.round(expanded.length / sourceUnit.length)
      }
      return `${indentStr.repeat(level)}${rest}`
    })
    .join('\n')
}

export function formatContent(
  input: string,
  format: DataFormat,
  indent: IndentOption = '2',
): string {
  const indentStr = indentToString(indent)
  const indentNum = indent === 'tab' ? 2 : Number(indent)

  switch (format) {
    case 'json':
    case 'jsonc': {
      const parsed = parseJsonLike(input)
      return JSON.stringify(parsed, null, indentStr)
    }
    case 'json5': {
      const parsed = JSON5.parse(input)
      return JSON5.stringify(parsed, null, indent === 'tab' ? '\t' : indentNum)
    }
    case 'yaml': {
      const parsed = yaml.load(input)
      return yaml
        .dump(parsed, {
          indent: indentNum,
          lineWidth: 120,
          noRefs: true,
        })
        .trimEnd()
    }
    case 'toml': {
      const parsed = parseToml(input)
      return stringifyToml(parsed).trimEnd()
    }
    case 'xml':
    case 'html': {
      return formatXmlString(input, indentStr)
    }
    case 'ndjson': {
      const lines = input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      return lines.map((line) => JSON.stringify(parseJsonLike(line))).join('\n')
    }
    case 'sql': {
      return formatSql(input, {
        tabWidth: indentNum,
        useTabs: indent === 'tab',
        keywordCase: 'upper',
      }).trimEnd()
    }
    case 'protobuf': {
      return formatBraceLanguage(input, indentStr)
    }
    default: {
      return normalizeIndentation(input, indentStr)
    }
  }
}

function minifySql(input: string): string {
  let out = ''
  let inQuote: "'" | '"' | null = null
  let prevSpace = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]

    if (inQuote) {
      out += ch
      if (ch === inQuote) {
        if (next === inQuote) {
          out += next
          i += 2
          continue
        }
        inQuote = null
      }
      i += 1
      continue
    }

    if (ch === '-' && next === '-') {
      while (i < input.length && input[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch
      out += ch
      prevSpace = false
      i += 1
      continue
    }
    if (/\s/.test(ch)) {
      if (!prevSpace && out.length > 0) {
        out += ' '
        prevSpace = true
      }
      i += 1
      continue
    }
    out += ch
    prevSpace = false
    i += 1
  }

  return out.trim()
}

export function minifyContent(input: string, format: DataFormat): string {
  switch (format) {
    case 'json':
    case 'jsonc': {
      return JSON.stringify(parseJsonLike(input))
    }
    case 'json5': {
      return JSON5.stringify(JSON5.parse(input))
    }
    case 'xml':
    case 'html': {
      return input
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/>\s+</g, '><')
        .trim()
    }
    case 'ndjson': {
      return input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.stringify(parseJsonLike(line)))
        .join('\n')
    }
    case 'sql': {
      return minifySql(input)
    }
    case 'css': {
      return input
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .trim()
    }
    default: {
      return input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
    }
  }
}

function sortValueKeys(value: unknown, order: 'asc' | 'desc'): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValueKeys(item, order))
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    entries.sort(([a], [b]) => {
      if (a === b) return 0
      const cmp = a < b ? -1 : 1
      return order === 'asc' ? cmp : -cmp
    })
    const sorted: Record<string, unknown> = {}
    for (const [k, v] of entries) {
      sorted[k] = sortValueKeys(v, order)
    }
    return sorted
  }
  return value
}

export function sortJsonKeys(
  input: string,
  order: 'asc' | 'desc',
  indent: IndentOption = '2',
): string {
  const parsed = parseJsonLike(input)
  const sorted = sortValueKeys(parsed, order)
  return JSON.stringify(sorted, null, indentToString(indent))
}

export function escapeJsonString(input: string): string {
  return JSON.stringify(input).slice(1, -1)
}

export function unescapeJsonString(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'string') return parsed
    } catch {
      // fall through to unquoted unescape
    }
  }
  const wrapped = `"${input.replace(/(^|[^\\])"/g, '$1\\"')}"`
  return JSON.parse(wrapped) as string
}

export function repairJsonLocal(
  input: string,
  indent: IndentOption = '2',
): { output: string; changed: boolean } {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Empty JSON input')
  }
  const repaired = jsonrepair(trimmed)
  const parsed = JSON.parse(repaired)
  const output = JSON.stringify(parsed, null, indentToString(indent))
  return {
    output,
    changed: output !== trimmed,
  }
}
