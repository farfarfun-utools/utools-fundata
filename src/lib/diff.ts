import { diffLines } from 'diff'

export type DiffRowKind = 'same' | 'added' | 'removed' | 'modified'

export interface DiffRow {
  leftLine: number | null
  rightLine: number | null
  leftText: string
  rightText: string
  kind: DiffRowKind
}

export interface DiffStats {
  added: number
  removed: number
  modified: number
  unchanged: number
}

export interface DiffResult {
  rows: DiffRow[]
  stats: DiffStats
  unified: string
}

function splitChangeLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

export function computeDiff(
  left: string,
  right: string,
  options?: { ignoreWhitespace?: boolean },
): DiffResult {
  const normLeft = left.replace(/\r\n/g, '\n')
  const normRight = right.replace(/\r\n/g, '\n')

  const ensureEol = (text: string): string =>
    text.length > 0 && !text.endsWith('\n') ? `${text}\n` : text

  const parts = diffLines(ensureEol(normLeft), ensureEol(normRight), {
    ignoreWhitespace: Boolean(options?.ignoreWhitespace),
  })
  const rows: DiffRow[] = []
  const unifiedLines: string[] = []
  const stats: DiffStats = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
  }

  let leftNum = 1
  let rightNum = 1

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    const next = parts[i + 1]

    if (part.removed && next?.added) {
      const removedLines = splitChangeLines(part.value)
      const addedLines = splitChangeLines(next.value)
      const maxLen = Math.max(removedLines.length, addedLines.length)

      for (const l of removedLines) unifiedLines.push(`- ${l}`)
      for (const r of addedLines) unifiedLines.push(`+ ${r}`)

      for (let j = 0; j < maxLen; j += 1) {
        const hasLeft = j < removedLines.length
        const hasRight = j < addedLines.length
        if (hasLeft && hasRight) {
          rows.push({
            leftLine: leftNum,
            rightLine: rightNum,
            leftText: removedLines[j],
            rightText: addedLines[j],
            kind: 'modified',
          })
          leftNum += 1
          rightNum += 1
          stats.modified += 1
        } else if (hasLeft) {
          rows.push({
            leftLine: leftNum,
            rightLine: null,
            leftText: removedLines[j],
            rightText: '',
            kind: 'removed',
          })
          leftNum += 1
          stats.removed += 1
        } else if (hasRight) {
          rows.push({
            leftLine: null,
            rightLine: rightNum,
            leftText: '',
            rightText: addedLines[j],
            kind: 'added',
          })
          rightNum += 1
          stats.added += 1
        }
      }
      i += 1
      continue
    }

    const lines = splitChangeLines(part.value)
    if (part.added) {
      for (const line of lines) {
        rows.push({
          leftLine: null,
          rightLine: rightNum,
          leftText: '',
          rightText: line,
          kind: 'added',
        })
        unifiedLines.push(`+ ${line}`)
        rightNum += 1
        stats.added += 1
      }
    } else if (part.removed) {
      for (const line of lines) {
        rows.push({
          leftLine: leftNum,
          rightLine: null,
          leftText: line,
          rightText: '',
          kind: 'removed',
        })
        unifiedLines.push(`- ${line}`)
        leftNum += 1
        stats.removed += 1
      }
    } else {
      for (const line of lines) {
        rows.push({
          leftLine: leftNum,
          rightLine: rightNum,
          leftText: line,
          rightText: line,
          kind: 'same',
        })
        unifiedLines.push(`  ${line}`)
        leftNum += 1
        rightNum += 1
        stats.unchanged += 1
      }
    }
  }

  return {
    rows,
    stats,
    unified: unifiedLines.join('\n'),
  }
}
