import { parseJsonLike } from './formats'

export interface TableData {
  columns: string[]
  rows: Record<string, string>[]
  rawRows: Record<string, unknown>[]
  error?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function jsonToTable(input: string): TableData {
  let parsed: unknown
  try {
    parsed = parseJsonLike(input)
  } catch (err) {
    return {
      columns: [],
      rows: [],
      rawRows: [],
      error: err instanceof Error ? err.message : 'Invalid JSON input',
    }
  }

  let rawRows: Record<string, unknown>[]
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { columns: [], rows: [], rawRows: [] }
    }
    rawRows = parsed.map((item) => (isPlainObject(item) ? item : { value: item }))
  } else if (isPlainObject(parsed)) {
    rawRows = [parsed]
  } else {
    rawRows = [{ value: parsed }]
  }

  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }

  const rows: Record<string, string>[] = rawRows.map((rawRow) => {
    const formatted: Record<string, string> = {}
    for (const col of columns) {
      formatted[col] = formatCell(rawRow[col])
    }
    return formatted
  })

  return { columns, rows, rawRows }
}

function escapeDelimited(cell: string, delimiter: ',' | '\t'): string {
  if (
    cell.includes(delimiter) ||
    cell.includes('"') ||
    cell.includes('\n') ||
    cell.includes('\r')
  ) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

function escapeMarkdownCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

export function exportTable(
  columns: string[],
  rows: Record<string, string>[],
  format: 'csv' | 'tsv' | 'markdown' | 'json',
): string {
  if (format === 'json') {
    return JSON.stringify(rows, null, 2)
  }

  if (columns.length === 0) return ''

  if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'csv' ? ',' : '\t'
    const header = columns.map((col) => escapeDelimited(col, delimiter)).join(delimiter)
    const body = rows.map((row) =>
      columns.map((col) => escapeDelimited(row[col] ?? '', delimiter)).join(delimiter),
    )
    return [header, ...body].join('\n')
  }

  // markdown
  const header = `| ${columns.map(escapeMarkdownCell).join(' | ')} |`
  const divider = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map(
    (row) => `| ${columns.map((col) => escapeMarkdownCell(row[col] ?? '')).join(' | ')} |`,
  )
  return [header, divider, ...body].join('\n')
}
