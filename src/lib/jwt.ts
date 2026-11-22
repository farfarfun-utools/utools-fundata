export type JwtStatus = 'valid' | 'expired' | 'not-yet-valid' | 'no-exp'
export type JwtHmacAlgorithm = 'HS256' | 'HS384' | 'HS512'

export interface DecodedJwt {
  raw: string
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  algorithm: string
  status: JwtStatus
  issuedAt?: string
  notBefore?: string
  expiresAt?: string
  expiresIn?: string
  headerJson: string
  payloadJson: string
}

export interface SignedJwtResult {
  token: string
  algorithm: JwtHmacAlgorithm
  headerJson: string
  payloadJson: string
  signature: string
}

function stripBearer(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim()
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function encodeBase64UrlText(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text))
}

function base64UrlToBytes(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new Error('Invalid Base64URL segment in JWT')
  }
  const pad = (4 - (normalized.length % 4)) % 4
  const binary = atob(normalized + '='.repeat(pad))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function decodeBase64UrlText(segment: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(segment))
}

/**
 * Quote integer literals outside string literals whose magnitude exceeds Number.MAX_SAFE_INTEGER
 * so JSON.parse preserves them losslessly as strings.
 */
function quoteUnsafeIntegers(jsonText: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escaped = false
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
  const minSafe = BigInt(Number.MIN_SAFE_INTEGER)

  while (i < jsonText.length) {
    const ch = jsonText[i]
    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      i += 1
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      i += 1
      continue
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const start = i
      if (jsonText[i] === '-') i += 1
      while (i < jsonText.length && jsonText[i] >= '0' && jsonText[i] <= '9') {
        i += 1
      }
      let isFloat = false
      if (jsonText[i] === '.') {
        isFloat = true
        i += 1
        while (i < jsonText.length && jsonText[i] >= '0' && jsonText[i] <= '9') {
          i += 1
        }
      }
      if (jsonText[i] === 'e' || jsonText[i] === 'E') {
        isFloat = true
        i += 1
        if (jsonText[i] === '+' || jsonText[i] === '-') i += 1
        while (i < jsonText.length && jsonText[i] >= '0' && jsonText[i] <= '9') {
          i += 1
        }
      }
      const token = jsonText.slice(start, i)
      if (!isFloat && /^-?\d{16,}$/.test(token)) {
        try {
          const big = BigInt(token)
          if (big > maxSafe || big < minSafe) {
            out += `"${token}"`
            continue
          }
        } catch {
          // keep original token
        }
      }
      out += token
      continue
    }

    out += ch
    i += 1
  }

  return out
}

function parseNumericClaim(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return null
}

function formatDurationSeconds(diffSec: number): string {
  const abs = Math.abs(Math.trunc(diffSec))
  const future = diffSec >= 0
  if (abs < 60) return future ? `in ${abs}s` : `${abs}s ago`
  if (abs < 3600) {
    const m = Math.floor(abs / 60)
    return future ? `in ${m}m` : `${m}m ago`
  }
  if (abs < 86400) {
    const h = Math.floor(abs / 3600)
    return future ? `in ${h}h` : `${h}h ago`
  }
  const d = Math.floor(abs / 86400)
  return future ? `in ${d}d` : `${d}d ago`
}

export function decodeJwt(token: string): DecodedJwt {
  const cleaned = stripBearer(token)
  const parts = cleaned.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Invalid JWT format: expected header.payload.signature')
  }

  const [headerSeg, payloadSeg, signature] = parts
  const headerRaw = decodeBase64UrlText(headerSeg)
  const payloadRaw = decodeBase64UrlText(payloadSeg)

  const headerParsed = JSON.parse(headerRaw)
  const payloadParsed = JSON.parse(quoteUnsafeIntegers(payloadRaw))

  if (
    headerParsed === null ||
    typeof headerParsed !== 'object' ||
    Array.isArray(headerParsed)
  ) {
    throw new Error('Invalid JWT header: expected JSON object')
  }
  if (
    payloadParsed === null ||
    typeof payloadParsed !== 'object' ||
    Array.isArray(payloadParsed)
  ) {
    throw new Error('Invalid JWT payload: expected JSON object')
  }

  const header = headerParsed as Record<string, unknown>
  const payload = payloadParsed as Record<string, unknown>
  const algorithm = typeof header.alg === 'string' ? header.alg : 'unknown'

  const nowSec = Math.floor(Date.now() / 1000)
  const iat = parseNumericClaim(payload.iat)
  const nbf = parseNumericClaim(payload.nbf)
  const exp = parseNumericClaim(payload.exp)

  let status: JwtStatus = 'no-exp'
  if (nbf !== null && nowSec < nbf) {
    status = 'not-yet-valid'
  } else if (exp !== null) {
    status = nowSec >= exp ? 'expired' : 'valid'
  }

  return {
    raw: cleaned,
    header,
    payload,
    signature,
    algorithm,
    status,
    issuedAt: iat !== null ? new Date(iat * 1000).toISOString() : undefined,
    notBefore: nbf !== null ? new Date(nbf * 1000).toISOString() : undefined,
    expiresAt: exp !== null ? new Date(exp * 1000).toISOString() : undefined,
    expiresIn: exp !== null ? formatDurationSeconds(exp - nowSec) : undefined,
    headerJson: JSON.stringify(header, null, 2),
    payloadJson: JSON.stringify(payload, null, 2),
  }
}

const HMAC_ALGORITHMS: Record<JwtHmacAlgorithm, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
}

export async function verifyJwtHmac(
  token: string,
  secret: string,
): Promise<{ valid: boolean; algorithm: string; reason: string }> {
  let decoded: DecodedJwt
  try {
    decoded = decodeJwt(token)
  } catch (err) {
    return {
      valid: false,
      algorithm: 'unknown',
      reason: err instanceof Error ? err.message : 'Invalid JWT',
    }
  }

  const alg = decoded.algorithm.toUpperCase() as JwtHmacAlgorithm
  const hash = HMAC_ALGORITHMS[alg]
  if (!hash) {
    return {
      valid: false,
      algorithm: decoded.algorithm,
      reason: `Unsupported algorithm "${decoded.algorithm}": only HS256, HS384, HS512 are supported`,
    }
  }

  if (!secret) {
    return {
      valid: false,
      algorithm: alg,
      reason: 'Secret is required for HMAC verification',
    }
  }

  if (!decoded.signature) {
    return {
      valid: false,
      algorithm: alg,
      reason: 'JWT signature segment is empty',
    }
  }

  const parts = decoded.raw.split('.')
  const signingInput = `${parts[0]}.${parts[1]}`

  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) {
      return {
        valid: false,
        algorithm: alg,
        reason: 'Web Crypto SubtleCrypto is unavailable in this environment',
      }
    }

    const encoder = new TextEncoder()
    const key = await subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: { name: hash } },
      false,
      ['verify'],
    )
    const sigBytes = base64UrlToBytes(decoded.signature)
    const dataBytes = encoder.encode(signingInput)
    const isValid = await subtle.verify(
      'HMAC',
      key,
      sigBytes as BufferSource,
      dataBytes as BufferSource,
    )
    return {
      valid: isValid,
      algorithm: alg,
      reason: isValid ? 'Signature verified' : 'Invalid signature',
    }
  } catch (err) {
    return {
      valid: false,
      algorithm: alg,
      reason: err instanceof Error ? err.message : 'Verification failed',
    }
  }
}

export async function signJwtHmac(
  headerInput: Record<string, unknown> | string,
  payloadInput: Record<string, unknown> | string,
  secret: string,
  algorithmOverride?: JwtHmacAlgorithm,
): Promise<SignedJwtResult> {
  if (!secret) {
    throw new Error('Secret is required to sign JWT')
  }

  const headerObj =
    typeof headerInput === 'string'
      ? (JSON.parse(headerInput) as Record<string, unknown>)
      : { ...headerInput }
  const payloadObj =
    typeof payloadInput === 'string'
      ? (JSON.parse(payloadInput) as Record<string, unknown>)
      : { ...payloadInput }

  if (!headerObj || typeof headerObj !== 'object' || Array.isArray(headerObj)) {
    throw new Error('Header must be a JSON object')
  }
  if (!payloadObj || typeof payloadObj !== 'object' || Array.isArray(payloadObj)) {
    throw new Error('Payload must be a JSON object')
  }

  const rawAlg = (algorithmOverride ?? String(headerObj.alg ?? 'HS256')).toUpperCase() as JwtHmacAlgorithm
  const hash = HMAC_ALGORITHMS[rawAlg]
  if (!hash) {
    throw new Error(`Unsupported HMAC algorithm "${rawAlg}": use HS256, HS384, or HS512`)
  }

  const finalHeader: Record<string, unknown> = {
    typ: 'JWT',
    ...headerObj,
    alg: rawAlg,
  }

  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto SubtleCrypto is unavailable in this environment')
  }

  const headerCompact = JSON.stringify(finalHeader)
  const payloadCompact = JSON.stringify(payloadObj)
  const signingInput = `${encodeBase64UrlText(headerCompact)}.${encodeBase64UrlText(payloadCompact)}`

  const encoder = new TextEncoder()
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: { name: hash } },
    false,
    ['sign'],
  )
  const sigBuffer = await subtle.sign('HMAC', key, encoder.encode(signingInput))
  const signature = bytesToBase64Url(new Uint8Array(sigBuffer))

  return {
    token: `${signingInput}.${signature}`,
    algorithm: rawAlg,
    headerJson: JSON.stringify(finalHeader, null, 2),
    payloadJson: JSON.stringify(payloadObj, null, 2),
    signature,
  }
}
