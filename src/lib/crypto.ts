export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'
export type HashEncoding = 'hex' | 'HEX' | 'base64'
export type IdGeneratorKind = 'uuid' | 'ulid' | 'nanoid' | 'hex32' | 'hex64' | 'base64url'

export interface HashRow {
  algorithm: HashAlgorithm
  label: string
  bits: number
  value: string
}

// RFC 1321 MD5 pure TypeScript implementation (UTF-8 safe via Uint8Array)
const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const MD5_K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
)

function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

export function md5Bytes(input: Uint8Array): Uint8Array {
  const origLen = input.length
  const bitLen = BigInt(origLen) * 8n
  const padLen = ((55 - (origLen % 64)) + 64) % 64
  const totalLen = origLen + 1 + padLen + 8
  const buf = new Uint8Array(totalLen)
  buf.set(input, 0)
  buf[origLen] = 0x80

  const view = new DataView(buf.buffer)
  view.setUint32(totalLen - 8, Number(bitLen & 0xffffffffn), true)
  view.setUint32(totalLen - 4, Number((bitLen >> 32n) & 0xffffffffn), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const M = new Uint32Array(16)

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j += 1) {
      M[j] = view.getUint32(offset + j * 4, true)
    }

    let A = a0
    let B = b0
    let C = c0
    let D = d0

    for (let i = 0; i < 64; i += 1) {
      let F: number
      let g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + MD5_K[i] + M[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + rotl32(F, MD5_SHIFTS[i])) >>> 0
    }

    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0, true)
  outView.setUint32(4, b0, true)
  outView.setUint32(8, c0, true)
  outView.setUint32(12, d0, true)
  return out
}

function hmacMd5Bytes(keyBytes: Uint8Array, msgBytes: Uint8Array): Uint8Array {
  const blockSize = 64
  const keyBlock = new Uint8Array(blockSize)
  if (keyBytes.length > blockSize) {
    keyBlock.set(md5Bytes(keyBytes), 0)
  } else {
    keyBlock.set(keyBytes, 0)
  }

  const inner = new Uint8Array(blockSize + msgBytes.length)
  const outer = new Uint8Array(blockSize + 16)
  for (let i = 0; i < blockSize; i += 1) {
    inner[i] = keyBlock[i] ^ 0x36
    outer[i] = keyBlock[i] ^ 0x5c
  }
  inner.set(msgBytes, blockSize)
  outer.set(md5Bytes(inner), blockSize)
  return md5Bytes(outer)
}

export function formatDigestBytes(bytes: Uint8Array, encoding: HashEncoding = 'hex'): string {
  if (encoding === 'base64') {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i])
    }
    return btoa(bin)
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return encoding === 'HEX' ? hex.toUpperCase() : hex
}

const WEB_CRYPTO_ALG: Record<Exclude<HashAlgorithm, 'md5'>, 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
}

export async function computeSingleHash(
  input: string,
  algorithm: HashAlgorithm,
  options?: { hmacKey?: string; encoding?: HashEncoding },
): Promise<string> {
  const encoding = options?.encoding ?? 'hex'
  const encoder = new TextEncoder()
  const msgBytes = encoder.encode(input)
  const hmacKey = options?.hmacKey

  if (algorithm === 'md5') {
    const digest = hmacKey ? hmacMd5Bytes(encoder.encode(hmacKey), msgBytes) : md5Bytes(msgBytes)
    return formatDigestBytes(digest, encoding)
  }

  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto SubtleCrypto is unavailable in this environment')
  }

  const hashName = WEB_CRYPTO_ALG[algorithm]
  if (hmacKey) {
    const key = await subtle.importKey(
      'raw',
      encoder.encode(hmacKey),
      { name: 'HMAC', hash: { name: hashName } },
      false,
      ['sign'],
    )
    const sig = await subtle.sign('HMAC', key, msgBytes)
    return formatDigestBytes(new Uint8Array(sig), encoding)
  }

  const digest = await subtle.digest(hashName, msgBytes)
  return formatDigestBytes(new Uint8Array(digest), encoding)
}

export const HASH_SPECS: Array<{ algorithm: HashAlgorithm; label: string; bits: number }> = [
  { algorithm: 'md5', label: 'MD5', bits: 128 },
  { algorithm: 'sha1', label: 'SHA-1', bits: 160 },
  { algorithm: 'sha256', label: 'SHA-256', bits: 256 },
  { algorithm: 'sha384', label: 'SHA-384', bits: 384 },
  { algorithm: 'sha512', label: 'SHA-512', bits: 512 },
]

export async function computeAllHashes(
  input: string,
  options?: { hmacKey?: string; encoding?: HashEncoding },
): Promise<HashRow[]> {
  const values = await Promise.all(
    HASH_SPECS.map((spec) => computeSingleHash(input, spec.algorithm, options)),
  )
  return HASH_SPECS.map((spec, idx) => ({
    ...spec,
    value: values[idx],
  }))
}

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function generateUuidV4(): string {
  const bytes = getRandomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateUlid(nowMs = Date.now()): string {
  // 48-bit timestamp -> 10 Base32 chars
  let time = Math.max(0, Math.floor(nowMs))
  const timeChars = new Array<string>(10)
  for (let i = 9; i >= 0; i -= 1) {
    timeChars[i] = CROCKFORD_BASE32[time % 32]
    time = Math.floor(time / 32)
  }

  // 80-bit randomness -> 16 Base32 chars (5 bits each)
  const randBytes = getRandomBytes(16)
  const randChars = new Array<string>(16)
  for (let i = 0; i < 16; i += 1) {
    randChars[i] = CROCKFORD_BASE32[randBytes[i] & 31]
  }
  return timeChars.join('') + randChars.join('')
}

const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'

export function generateNanoId(length = 21): string {
  const clamped = Math.max(4, Math.min(128, Math.floor(length)))
  const bytes = getRandomBytes(clamped)
  let out = ''
  for (let i = 0; i < clamped; i += 1) {
    out += NANOID_ALPHABET[bytes[i] & 63]
  }
  return out
}

export function generateRandomHex(hexLength = 32): string {
  const clamped = Math.max(2, Math.min(256, Math.floor(hexLength)))
  const bytes = getRandomBytes(Math.ceil(clamped / 2))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, clamped)
}

export function generateRandomBase64Url(byteLength = 32): string {
  const bytes = getRandomBytes(Math.max(8, Math.min(128, Math.floor(byteLength))))
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generateIdBatch(
  kind: IdGeneratorKind,
  count: number,
  options?: { nanoIdLength?: number },
): string[] {
  const n = Math.max(1, Math.min(50, Math.floor(count)))
  const list: string[] = []
  for (let i = 0; i < n; i += 1) {
    switch (kind) {
      case 'uuid':
        list.push(generateUuidV4())
        break
      case 'ulid':
        list.push(generateUlid())
        break
      case 'nanoid':
        list.push(generateNanoId(options?.nanoIdLength ?? 21))
        break
      case 'hex32':
        list.push(generateRandomHex(32))
        break
      case 'hex64':
        list.push(generateRandomHex(64))
        break
      case 'base64url':
        list.push(generateRandomBase64Url(32))
        break
    }
  }
  return list
}
