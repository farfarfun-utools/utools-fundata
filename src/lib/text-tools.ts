export type TextBatchOp =
  | 'dedupe'
  | 'sort-asc'
  | 'sort-desc'
  | 'reverse'
  | 'remove-empty'
  | 'trim'
  | 'upper'
  | 'lower'
  | 'affix'

export interface LineFrequency {
  line: string
  count: number
  percent: number
}

export interface TextStats {
  lines: number
  nonEmptyLines: number
  words: number
  chars: number
  bytes: number
  topLines: LineFrequency[]
}

export function transformText(
  input: string,
  op: TextBatchOp,
  options?: { prefix?: string; suffix?: string },
): string {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  switch (op) {
    case 'dedupe': {
      const seen = new Set<string>()
      const out: string[] = []
      for (const line of lines) {
        if (!seen.has(line)) {
          seen.add(line)
          out.push(line)
        }
      }
      return out.join('\n')
    }
    case 'sort-asc':
      return [...lines].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('\n')
    case 'sort-desc':
      return [...lines].sort((a, b) => b.localeCompare(a, 'zh-CN')).join('\n')
    case 'reverse':
      return [...lines].reverse().join('\n')
    case 'remove-empty':
      return lines.filter((line) => line.trim().length > 0).join('\n')
    case 'trim':
      return lines.map((line) => line.trim()).join('\n')
    case 'upper':
      return input.toUpperCase()
    case 'lower':
      return input.toLowerCase()
    case 'affix': {
      const prefix = options?.prefix ?? ''
      const suffix = options?.suffix ?? ''
      return lines.map((line) => `${prefix}${line}${suffix}`).join('\n')
    }
  }
}

export function computeTextStats(input: string): TextStats {
  if (!input) {
    return {
      lines: 0,
      nonEmptyLines: 0,
      words: 0,
      chars: 0,
      bytes: 0,
      topLines: [],
    }
  }

  const normalized = input.replace(/\r\n/g, '\n')
  const rawLines = normalized.split('\n')
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0)
  const words = normalized
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const bytes = new TextEncoder().encode(input).length

  const freqMap = new Map<string, number>()
  for (const line of nonEmpty) {
    const key = line.trim()
    freqMap.set(key, (freqMap.get(key) ?? 0) + 1)
  }

  const totalNonEmpty = nonEmpty.length || 1
  const topLines: LineFrequency[] = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([line, count]) => ({
      line,
      count,
      percent: Math.round((count / totalNonEmpty) * 1000) / 10,
    }))

  return {
    lines: rawLines.length,
    nonEmptyLines: nonEmpty.length,
    words,
    chars: input.length,
    bytes,
    topLines,
  }
}
