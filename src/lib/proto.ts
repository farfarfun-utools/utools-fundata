interface ProtoScope {
  kind: 'root' | 'message' | 'oneof' | 'enum' | 'service' | 'other'
  nextNumber: number
  reservedNumbers: Set<number>
  reservedRanges: Array<[number, number]>
  allowAlias: boolean
  aliasMap: Map<number, number>
}

const PROTO_RESERVED_START = 19000
const PROTO_RESERVED_END = 19999

function stripLineCommentsAndStrings(line: string, inBlockComment: boolean): {
  code: string
  inBlockComment: boolean
} {
  let code = ''
  let i = 0
  let block = inBlockComment
  let inQuote: '"' | "'" | null = null
  let escaped = false

  while (i < line.length) {
    const ch = line[i]
    const next = line[i + 1]

    if (block) {
      if (ch === '*' && next === '/') {
        block = false
        i += 2
      } else {
        i += 1
      }
      continue
    }

    if (inQuote) {
      code += ' '
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === inQuote) {
        inQuote = null
      }
      i += 1
      continue
    }

    if (ch === '/' && next === '/') {
      break
    }
    if (ch === '/' && next === '*') {
      block = true
      i += 2
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      code += ' '
      i += 1
      continue
    }

    code += ch
    i += 1
  }

  return { code, inBlockComment: block }
}

function parseReservedSpec(
  spec: string,
  numbers: Set<number>,
  ranges: Array<[number, number]>,
): void {
  const parts = spec.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed || trimmed.startsWith('"') || trimmed.startsWith("'")) continue
    const rangeMatch = /^(-?\d+)\s+to\s+(-?\d+|max)$/i.exec(trimmed)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end =
        rangeMatch[2].toLowerCase() === 'max' ? Number.MAX_SAFE_INTEGER : Number(rangeMatch[2])
      ranges.push([Math.min(start, end), Math.max(start, end)])
      continue
    }
    if (/^-?\d+$/.test(trimmed)) {
      numbers.add(Number(trimmed))
    }
  }
}

function preScanScopeMeta(
  lines: string[],
  startLine: number,
  initialBlockComment: boolean,
): {
  reservedNumbers: Set<number>
  reservedRanges: Array<[number, number]>
  allowAlias: boolean
} {
  const reservedNumbers = new Set<number>()
  const reservedRanges: Array<[number, number]> = []
  let allowAlias = false
  let depth = 0
  let started = false
  let inBlock = initialBlockComment

  for (let i = startLine; i < lines.length; i += 1) {
    const rawLine = lines[i]
    const stripped = stripLineCommentsAndStrings(rawLine, inBlock)
    inBlock = stripped.inBlockComment
    const code = stripped.code

    if (started && depth === 1) {
      const reservedMatch = /^\s*(?:reserved|extensions)\s+([^;]+);/.exec(rawLine.replace(/\/\/.*$/, ''))
      if (reservedMatch) {
        parseReservedSpec(reservedMatch[1], reservedNumbers, reservedRanges)
      }
      if (/^\s*option\s+allow_alias\s*=\s*true\s*;/.test(rawLine)) {
        allowAlias = true
      }
    }

    for (const ch of code) {
      if (ch === '{') {
        depth += 1
        started = true
      } else if (ch === '}') {
        depth -= 1
        if (started && depth <= 0) {
          return { reservedNumbers, reservedRanges, allowAlias }
        }
      }
    }
  }

  return { reservedNumbers, reservedRanges, allowAlias }
}

function isNumberReserved(scope: ProtoScope, num: number, isMessage: boolean): boolean {
  if (isMessage && num >= PROTO_RESERVED_START && num <= PROTO_RESERVED_END) {
    return true
  }
  if (scope.reservedNumbers.has(num)) return true
  for (const [start, end] of scope.reservedRanges) {
    if (num >= start && num <= end) return true
  }
  return false
}

function allocateNextNumber(scope: ProtoScope, isMessage: boolean): number {
  let candidate = scope.nextNumber
  while (isNumberReserved(scope, candidate, isMessage)) {
    if (isMessage && candidate >= PROTO_RESERVED_START && candidate <= PROTO_RESERVED_END) {
      candidate = PROTO_RESERVED_END + 1
    } else {
      candidate += 1
    }
  }
  scope.nextNumber = candidate + 1
  return candidate
}

function findOwnerMessageScope(stack: ProtoScope[]): ProtoScope | null {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].kind === 'message') return stack[i]
    if (stack[i].kind !== 'oneof') return null
  }
  return null
}

function detectOpeningScopeKind(codeBeforeBrace: string): ProtoScope['kind'] {
  const trimmed = codeBeforeBrace.trim()
  if (/\bmessage\s+[A-Za-z_]\w*\s*$/.test(trimmed)) return 'message'
  if (/\boneof\s+[A-Za-z_]\w*\s*$/.test(trimmed)) return 'oneof'
  if (/\benum\s+[A-Za-z_]\w*\s*$/.test(trimmed)) return 'enum'
  if (/\bservice\s+[A-Za-z_]\w*\s*$/.test(trimmed)) return 'service'
  return 'other'
}

function replaceFieldTag(
  line: string,
  newNumber: number,
  isEnum: boolean,
): { line: string; oldNumber: number; matched: boolean } {
  // Split off trailing line comment to avoid touching comment text
  let commentIdx = -1
  let inQuote: '"' | "'" | null = null
  let escaped = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      continue
    }
    if (ch === '/' && line[i + 1] === '/') {
      commentIdx = i
      break
    }
  }

  const codePart = commentIdx === -1 ? line : line.slice(0, commentIdx)
  const commentPart = commentIdx === -1 ? '' : line.slice(commentIdx)

  const trimmedCode = codePart.trim()
  if (
    !trimmedCode ||
    /^(?:syntax|edition|package|import|option|reserved|extensions|extend|rpc|returns|message|enum|oneof|service)\b/.test(
      trimmedCode,
    )
  ) {
    return { line, oldNumber: 0, matched: false }
  }

  const fieldRegex = isEnum
    ? /^(\s*[A-Za-z_]\w*\s*=\s*)(-?\d+)(\s*(?:\[[\s\S]*\])?\s*;\s*)$/
    : /^(\s*(?:(?:repeated|optional|required)\s+)?(?:map\s*<[^>]+>|[A-Za-z_.][\w.]*)\s+[A-Za-z_]\w*\s*=\s*)(\d+)(\s*(?:\[[\s\S]*\])?\s*;\s*)$/

  const match = fieldRegex.exec(codePart)
  if (!match) {
    return { line, oldNumber: 0, matched: false }
  }

  const oldNumber = Number(match[2])
  const replaced = `${match[1]}${newNumber}${match[3]}${commentPart}`
  return { line: replaced, oldNumber, matched: true }
}

export function renumberProto(input: string): { output: string; changes: number } {
  const hasCrlf = input.includes('\r\n')
  const eol = hasCrlf ? '\r\n' : '\n'
  const lines = input.split(/\r?\n/)

  const stack: ProtoScope[] = [
    {
      kind: 'root',
      nextNumber: 1,
      reservedNumbers: new Set(),
      reservedRanges: [],
      allowAlias: false,
      aliasMap: new Map(),
    },
  ]

  let changes = 0
  let inBlockComment = false
  const outputLines: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]
    const blockBeforeLine = inBlockComment
    const stripped = stripLineCommentsAndStrings(rawLine, inBlockComment)
    inBlockComment = stripped.inBlockComment
    const code = stripped.code

    let lineToEmit = rawLine
    const currentScope = stack[stack.length - 1]

    // Renumber only when line does not open/close a block (normal field / enum value line)
    if (!code.includes('{') && !code.includes('}')) {
      if (currentScope.kind === 'message' || currentScope.kind === 'oneof') {
        const owner = findOwnerMessageScope(stack)
        if (owner) {
          const probe = replaceFieldTag(rawLine, 0, false)
          if (probe.matched) {
            const nextNum = allocateNextNumber(owner, true)
            const applied = replaceFieldTag(rawLine, nextNum, false)
            lineToEmit = applied.line
            if (applied.oldNumber !== nextNum) {
              changes += 1
            }
          }
        }
      } else if (currentScope.kind === 'enum') {
        const probe = replaceFieldTag(rawLine, 0, true)
        if (probe.matched) {
          let nextNum: number
          if (currentScope.allowAlias && currentScope.aliasMap.has(probe.oldNumber)) {
            nextNum = currentScope.aliasMap.get(probe.oldNumber) as number
          } else {
            nextNum = allocateNextNumber(currentScope, false)
            if (currentScope.allowAlias) {
              currentScope.aliasMap.set(probe.oldNumber, nextNum)
            }
          }
          const applied = replaceFieldTag(rawLine, nextNum, true)
          lineToEmit = applied.line
          if (applied.oldNumber !== nextNum) {
            changes += 1
          }
        }
      }
    }

    outputLines.push(lineToEmit)

    // Update scope stack based on braces on this line
    let braceScanPos = 0
    for (let c = 0; c < code.length; c += 1) {
      const ch = code[c]
      if (ch === '{') {
        const kind = detectOpeningScopeKind(code.slice(braceScanPos, c))
        braceScanPos = c + 1
        if (kind === 'message' || kind === 'enum') {
          const meta = preScanScopeMeta(lines, i, blockBeforeLine)
          stack.push({
            kind,
            nextNumber: kind === 'enum' ? 0 : 1,
            reservedNumbers: meta.reservedNumbers,
            reservedRanges: meta.reservedRanges,
            allowAlias: meta.allowAlias,
            aliasMap: new Map(),
          })
        } else {
          stack.push({
            kind,
            nextNumber: 1,
            reservedNumbers: new Set(),
            reservedRanges: [],
            allowAlias: false,
            aliasMap: new Map(),
          })
        }
      } else if (ch === '}') {
        braceScanPos = c + 1
        if (stack.length > 1) {
          stack.pop()
        }
      }
    }
  }

  return {
    output: outputLines.join(eol),
    changes,
  }
}
