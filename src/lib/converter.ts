import yaml from 'js-yaml'
import JSON5 from 'json5'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { detectFormat, indentToString, parseJsonLike, type IndentOption } from './formats'

export type ConvertFormat =
  | 'json'
  | 'json5'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'ini'
  | 'ndjson'
  | 'query'

export const CONVERT_FORMATS: Array<{ id: ConvertFormat; label: string }> = [
  { id: 'json', label: 'JSON' },
  { id: 'json5', label: 'JSON5' },
  { id: 'yaml', label: 'YAML' },
  { id: 'toml', label: 'TOML' },
  { id: 'xml', label: 'XML' },
  { id: 'csv', label: 'CSV' },
  { id: 'tsv', label: 'TSV' },
  { id: 'ini', label: 'INI' },
  { id: 'ndjson', label: 'NDJSON' },
  { id: 'query', label: 'URL Query' },
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unescapeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
}

function escapeXmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function parseXmlScalar(text: string): unknown {
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    const num = Number(text)
    if (Number.isSafeInteger(num) || text.includes('.')) {
      return num
    }
  }
  return text
}

interface XmlElementNode {
  tag: string
  attrs: Record<string, string>
  children: XmlElementNode[]
  textParts: string[]
}

function parseXmlAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = attrRegex.exec(attrStr)) !== null) {
    attrs[m[1]] = unescapeXmlEntities(m[2] ?? m[3] ?? '')
  }
  return attrs
}

function xmlNodeToJs(node: XmlElementNode): unknown {
  const hasAttrs = Object.keys(node.attrs).length > 0
  const hasChildren = node.children.length > 0
  const text = node.textParts.join('').trim()

  if (!hasAttrs && !hasChildren) {
    return text === '' ? '' : parseXmlScalar(text)
  }

  const obj: Record<string, unknown> = {}
  if (hasAttrs) {
    obj['@attributes'] = node.attrs
  }
  for (const child of node.children) {
    const childVal = xmlNodeToJs(child)
    if (Object.prototype.hasOwnProperty.call(obj, child.tag)) {
      const existing = obj[child.tag]
      if (Array.isArray(existing)) {
        existing.push(childVal)
      } else {
        obj[child.tag] = [existing, childVal]
      }
    } else {
      obj[child.tag] = childVal
    }
  }
  if (text) {
    obj['#text'] = parseXmlScalar(text)
  }
  return obj
}

export function parseXmlToJson(input: string): unknown {
  const cleaned = input
    .replace(/^\uFEFF/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()

  if (!cleaned) {
    throw new Error('Empty XML input')
  }

  const tokenRegex = /(<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w:.-]*(?:\s+[^<>]*)?\/?>|[^<]+)/g
  const stack: XmlElementNode[] = []
  let root: XmlElementNode | null = null
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(cleaned)) !== null) {
    const token = match[0]
    if (token.startsWith('<![CDATA[')) {
      const inner = token.slice(9, -3)
      const top = stack[stack.length - 1]
      if (top) top.textParts.push(inner)
      continue
    }
    if (token.startsWith('</')) {
      const closeTag = token.slice(2, -1).trim()
      const popped = stack.pop()
      if (!popped || popped.tag !== closeTag) {
        throw new Error(`Mismatched XML closing tag </${closeTag}>`)
      }
      continue
    }
    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>')
      const inner = token.slice(1, selfClosing ? -2 : -1).trim()
      const spaceIdx = inner.search(/\s/)
      const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)
      const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1)
      const node: XmlElementNode = {
        tag,
        attrs: parseXmlAttributes(attrStr),
        children: [],
        textParts: [],
      }
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node)
      } else if (!root) {
        root = node
      } else {
        throw new Error('Multiple XML root elements found')
      }
      if (!selfClosing) {
        stack.push(node)
      }
      continue
    }

    const top = stack[stack.length - 1]
    if (top && token.trim()) {
      top.textParts.push(unescapeXmlEntities(token))
    }
  }

  if (stack.length > 0) {
    throw new Error(`Unclosed XML tag <${stack[stack.length - 1].tag}>`)
  }
  if (!root) {
    throw new Error('Invalid XML document')
  }

  return { [root.tag]: xmlNodeToJs(root) }
}

function sanitizeXmlTag(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_.-]/g, '_')
  if (!cleaned || /^[^A-Za-z_]/.test(cleaned)) {
    return `_${cleaned || 'item'}`
  }
  return cleaned
}

function serializeXmlElement(
  tagName: string,
  value: unknown,
  indentStr: string,
  depth: number,
): string {
  const pad = indentStr.repeat(depth)
  const safeTag = sanitizeXmlTag(tagName)

  if (Array.isArray(value)) {
    return value
      .map((item) => serializeXmlElement(safeTag, item, indentStr, depth))
      .join('\n')
  }

  if (value === null || value === undefined) {
    return `${pad}<${safeTag}/>`
  }

  if (!isPlainObject(value)) {
    return `${pad}<${safeTag}>${escapeXmlEntities(String(value))}</${safeTag}>`
  }

  const rawAttrs = isPlainObject(value['@attributes'])
    ? (value['@attributes'] as Record<string, unknown>)
    : null
  const attrString = rawAttrs
    ? Object.entries(rawAttrs)
        .map(([k, v]) => ` ${sanitizeXmlTag(k)}="${escapeXmlEntities(String(v ?? ''))}"`)
        .join('')
    : ''

  const textVal = value['#text']
  const childEntries = Object.entries(value).filter(
    ([k]) => k !== '@attributes' && k !== '#text',
  )

  if (childEntries.length === 0) {
    if (textVal === undefined || textVal === null || textVal === '') {
      return `${pad}<${safeTag}${attrString}/>`
    }
    return `${pad}<${safeTag}${attrString}>${escapeXmlEntities(String(textVal))}</${safeTag}>`
  }

  const innerLines: string[] = []
  if (textVal !== undefined && textVal !== null && String(textVal).trim() !== '') {
    innerLines.push(`${indentStr.repeat(depth + 1)}${escapeXmlEntities(String(textVal))}`)
  }
  for (const [k, v] of childEntries) {
    innerLines.push(serializeXmlElement(k, v, indentStr, depth + 1))
  }

  return `${pad}<${safeTag}${attrString}>\n${innerLines.join('\n')}\n${pad}</${safeTag}>`
}

export function serializeJsonToXml(data: unknown, indent: IndentOption = '2'): string {
  const indentStr = indentToString(indent)
  if (isPlainObject(data)) {
    const keys = Object.keys(data)
    if (keys.length === 1 && !Array.isArray(data[keys[0]])) {
      return serializeXmlElement(keys[0], data[keys[0]], indentStr, 0)
    }
    return serializeXmlElement('root', data, indentStr, 0)
  }
  if (Array.isArray(data)) {
    return serializeXmlElement('root', { item: data }, indentStr, 0)
  }
  return serializeXmlElement('root', data, indentStr, 0)
}

export function parseDelimited(input: string, delimiter: ',' | '\t'): Record<string, string>[] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        inQuotes = false
        i += 1
        continue
      }
      currentCell += ch
      i += 1
      continue
    }

    if (ch === '"' && currentCell === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delimiter) {
      currentRow.push(currentCell)
      currentCell = ''
      i += 1
      continue
    }
    if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      i += 2
      continue
    }
    if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      i += 1
      continue
    }

    currentCell += ch
    i += 1
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  const nonEmptyRows = rows.filter((row) => !(row.length === 1 && row[0].trim() === ''))
  if (nonEmptyRows.length === 0) return []

  const headers = nonEmptyRows[0].map((header, idx) => header.trim() || `column_${idx + 1}`)
  const result: Record<string, string>[] = []
  for (let r = 1; r < nonEmptyRows.length; r += 1) {
    const row = nonEmptyRows[r]
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = row[c] ?? ''
    }
    result.push(obj)
  }

  return result
}

function escapeDelimitedCell(value: string, delimiter: ',' | '\t'): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function serializeDelimited(data: unknown, delimiter: ',' | '\t'): string {
  let records: Record<string, unknown>[]
  if (Array.isArray(data)) {
    if (data.length === 0) return ''
    records = data.map((item) => (isPlainObject(item) ? item : { value: item }))
  } else if (isPlainObject(data)) {
    records = [data]
  } else {
    records = [{ value: data }]
  }

  const columns: string[] = []
  const seen = new Set<string>()
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }

  const headerLine = columns.map((col) => escapeDelimitedCell(col, delimiter)).join(delimiter)
  const dataLines = records.map((record) =>
    columns.map((col) => escapeDelimitedCell(cellToString(record[col]), delimiter)).join(delimiter),
  )

  return [headerLine, ...dataLines].join('\n')
}

function parseIniScalar(raw: string): unknown {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isFinite(n)) return n
  }
  return trimmed
}

export function parseIniToJson(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> = root

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue

    const sectionMatch = /^\[([^\]]+)\]$/.exec(line)
    if (sectionMatch) {
      const sectionPath = sectionMatch[1].trim().split('.').filter(Boolean)
      let target: Record<string, unknown> = root
      for (const seg of sectionPath) {
        if (!isPlainObject(target[seg])) {
          target[seg] = {}
        }
        target = target[seg] as Record<string, unknown>
      }
      current = target
      continue
    }

    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const rawVal = line.slice(eqIdx + 1)
    if (!key) continue
    current[key] = parseIniScalar(rawVal)
  }

  return root
}

function formatIniValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value) || isPlainObject(value)) {
    return JSON.stringify(value)
  }
  const str = String(value)
  if (/^\s|\s$|[;#=]/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`
  }
  return str
}

export function serializeJsonToIni(data: unknown): string {
  const root: Record<string, unknown> = isPlainObject(data)
    ? data
    : Array.isArray(data)
      ? { items: data }
      : { value: data }

  const topLines: string[] = []
  const sections: Array<{ name: string; entries: Array<[string, unknown]> }> = []

  const collectSection = (name: string, obj: Record<string, unknown>) => {
    const scalarEntries: Array<[string, unknown]> = []
    const nested: Array<[string, Record<string, unknown>]> = []
    for (const [k, v] of Object.entries(obj)) {
      if (isPlainObject(v)) {
        nested.push([`${name}.${k}`, v])
      } else {
        scalarEntries.push([k, v])
      }
    }
    if (scalarEntries.length > 0 || nested.length === 0) {
      sections.push({ name, entries: scalarEntries })
    }
    for (const [subName, subObj] of nested) {
      collectSection(subName, subObj)
    }
  }

  for (const [k, v] of Object.entries(root)) {
    if (isPlainObject(v)) {
      collectSection(k, v)
    } else {
      topLines.push(`${k} = ${formatIniValue(v)}`)
    }
  }

  const blocks: string[] = []
  if (topLines.length > 0) {
    blocks.push(topLines.join('\n'))
  }
  for (const section of sections) {
    const lines = [`[${section.name}]`]
    for (const [k, v] of section.entries) {
      lines.push(`${k} = ${formatIniValue(v)}`)
    }
    blocks.push(lines.join('\n'))
  }

  return blocks.join('\n\n')
}

export function parseNdjsonToJson(input: string): unknown[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.map((line) => parseJsonLike(line))
}

export function serializeJsonToNdjson(data: unknown): string {
  if (Array.isArray(data)) {
    return data.map((item) => JSON.stringify(item)).join('\n')
  }
  return JSON.stringify(data)
}

export function parseQueryToJson(input: string): Record<string, unknown> {
  let queryStr = input.trim()
  const qIndex = queryStr.indexOf('?')
  if (/^https?:\/\//i.test(queryStr) && qIndex !== -1) {
    queryStr = queryStr.slice(qIndex + 1)
  } else if (queryStr.startsWith('?')) {
    queryStr = queryStr.slice(1)
  }
  const hashIndex = queryStr.indexOf('#')
  if (hashIndex !== -1) {
    queryStr = queryStr.slice(0, hashIndex)
  }

  const out: Record<string, unknown> = {}
  if (!queryStr) return out

  for (const part of queryStr.split('&')) {
    if (!part) continue
    const eqIdx = part.indexOf('=')
    const rawKey = eqIdx === -1 ? part : part.slice(0, eqIdx)
    const rawVal = eqIdx === -1 ? '' : part.slice(eqIdx + 1)
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
    const value = decodeURIComponent(rawVal.replace(/\+/g, ' '))

    if (Object.prototype.hasOwnProperty.call(out, key)) {
      const existing = out[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        out[key] = [existing, value]
      }
    } else {
      out[key] = value
    }
  }
  return out
}

export function serializeJsonToQuery(data: unknown): string {
  const pairs: string[] = []
  const pushPair = (key: string, val: unknown) => {
    if (val === undefined || val === null) {
      pairs.push(`${encodeURIComponent(key)}=`)
    } else if (Array.isArray(val)) {
      for (const item of val) {
        pushPair(key, item)
      }
    } else if (isPlainObject(val)) {
      for (const [subKey, subVal] of Object.entries(val)) {
        pushPair(`${key}[${subKey}]`, subVal)
      }
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`)
    }
  }

  if (isPlainObject(data)) {
    for (const [k, v] of Object.entries(data)) {
      pushPair(k, v)
    }
  } else if (Array.isArray(data)) {
    data.forEach((item, idx) => pushPair(String(idx), item))
  } else {
    pushPair('value', data)
  }

  return pairs.join('&')
}

function sanitizeForToml(value: unknown): unknown {
  if (value === null || value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForToml(item))
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === null) continue
      out[k] = sanitizeForToml(v)
    }
    return out
  }
  return value
}

function detectConvertFormat(input: string): ConvertFormat {
  const trimmed = input.trim()
  if (!trimmed) return 'json'

  // Check URL query string before falling back to text/ini
  if (
    !trimmed.includes('\n') &&
    ((trimmed.startsWith('?') && trimmed.includes('=')) ||
      (/^https?:\/\/.+\?.+=/.test(trimmed)) ||
      (/^[^={}[\]<\s]+=[^&]*(?:&[^={}[\]<\s]+=[^&]*)+$/.test(trimmed)))
  ) {
    return 'query'
  }

  const detected = detectFormat(trimmed)
  if (
    detected === 'json' ||
    detected === 'json5' ||
    detected === 'yaml' ||
    detected === 'toml' ||
    detected === 'xml' ||
    detected === 'csv' ||
    detected === 'tsv' ||
    detected === 'ini' ||
    detected === 'ndjson'
  ) {
    return detected
  }
  if (detected === 'jsonc') return 'json'
  return 'json'
}

function parseByFormat(input: string, format: ConvertFormat): unknown {
  switch (format) {
    case 'json':
      return parseJsonLike(input)
    case 'json5':
      return JSON5.parse(input)
    case 'yaml':
      return yaml.load(input)
    case 'toml':
      return parseToml(input)
    case 'xml':
      return parseXmlToJson(input)
    case 'csv':
      return parseDelimited(input, ',')
    case 'tsv':
      return parseDelimited(input, '\t')
    case 'ini':
      return parseIniToJson(input)
    case 'ndjson':
      return parseNdjsonToJson(input)
    case 'query':
      return parseQueryToJson(input)
  }
}

function serializeByFormat(data: unknown, format: ConvertFormat, indent: IndentOption): string {
  const indentStr = indentToString(indent)
  const indentNum = indent === 'tab' ? 2 : Number(indent)

  switch (format) {
    case 'json':
      return JSON.stringify(data, null, indentStr)
    case 'json5':
      return JSON5.stringify(data, null, indent === 'tab' ? '\t' : indentNum)
    case 'yaml':
      return yaml.dump(data, { indent: indentNum, lineWidth: 120, noRefs: true }).trimEnd()
    case 'toml': {
      const table = isPlainObject(data)
        ? sanitizeForToml(data)
        : Array.isArray(data)
          ? { items: sanitizeForToml(data) }
          : { value: sanitizeForToml(data) }
      return stringifyToml(table as Record<string, unknown>).trimEnd()
    }
    case 'xml':
      return serializeJsonToXml(data, indent)
    case 'csv':
      return serializeDelimited(data, ',')
    case 'tsv':
      return serializeDelimited(data, '\t')
    case 'ini':
      return serializeJsonToIni(data)
    case 'ndjson':
      return serializeJsonToNdjson(data)
    case 'query':
      return serializeJsonToQuery(data)
  }
}

export function convertFormat(
  input: string,
  from: ConvertFormat | 'auto',
  to: ConvertFormat,
  indent: IndentOption = '2',
): { output: string; detectedFrom: ConvertFormat } {
  const detectedFrom = from === 'auto' ? detectConvertFormat(input) : from
  const parsed = parseByFormat(input, detectedFrom)
  const output = serializeByFormat(parsed, to, indent)
  return { output, detectedFrom }
}
