// 1. Color Conversion & WCAG Contrast

export interface RgbaColor {
  r: number // 0..255
  g: number // 0..255
  b: number // 0..255
  a: number // 0..1
}

export type WcagGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail'

export interface ColorConversionResult {
  rgba: RgbaColor
  hex: string
  hexAlpha: string
  rgb: string
  rgbaStr: string
  hsl: string
  hsla: string
  contrastWhite: number
  contrastBlack: number
  gradeWhite: WcagGrade
  gradeBlack: WcagGrade
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function hslToRgba(h: number, s: number, l: number, a = 1): RgbaColor {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 100) / 100
  const light = clamp(l, 0, 100) / 100

  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hue < 60) [r1, g1, b1] = [c, x, 0]
  else if (hue < 120) [r1, g1, b1] = [x, c, 0]
  else if (hue < 180) [r1, g1, b1] = [0, c, x]
  else if (hue < 240) [r1, g1, b1] = [0, x, c]
  else if (hue < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: clamp(a, 0, 1),
  }
}

export function rgbaToHsl(c: RgbaColor): { h: number; s: number; l: number; a: number } {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: round2(c.a),
  }
}

export function parseColor(input: string): RgbaColor | null {
  const s = input.trim()
  if (!s) return null

  // HEX: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  const hexMatch = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(s)
  if (hexMatch) {
    const h = hexMatch[1]
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16)
      const g = parseInt(h[1] + h[1], 16)
      const b = parseInt(h[2] + h[2], 16)
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1
      return { r, g, b, a: round2(a) }
    }
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a: round2(a) }
  }

  // RGB / RGBA
  const rgbMatch =
    /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i.exec(
      s,
    )
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    if (r > 255 || g > 255 || b > 255) return null
    let a = 1
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4])
    }
    if (!Number.isFinite(a)) return null
    return { r, g, b, a: round2(clamp(a, 0, 1)) }
  }

  // HSL / HSLA
  const hslMatch =
    /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*[,\s]\s*(\d+(?:\.\d+)?)%(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i.exec(
      s,
    )
  if (hslMatch) {
    const h = parseFloat(hslMatch[1])
    const sat = parseFloat(hslMatch[2])
    const light = parseFloat(hslMatch[3])
    let a = 1
    if (hslMatch[4] !== undefined) {
      a = hslMatch[4].endsWith('%') ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4])
    }
    if (!Number.isFinite(a)) return null
    return hslToRgba(h, sat, light, a)
  }

  return null
}

function relativeLuminance(c: RgbaColor): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

export function contrastRatio(fg: RgbaColor, bg: RgbaColor): number {
  // Composite fg over bg if alpha < 1
  const r = Math.round(fg.r * fg.a + bg.r * (1 - fg.a))
  const g = Math.round(fg.g * fg.a + bg.g * (1 - fg.a))
  const b = Math.round(fg.b * fg.a + bg.b * (1 - fg.a))
  const l1 = relativeLuminance({ r, g, b, a: 1 })
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return round2((lighter + 0.05) / (darker + 0.05))
}

export function wcagGrade(ratio: number): WcagGrade {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}

export function convertColor(rgba: RgbaColor): ColorConversionResult {
  const toHex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  const hex = `#${toHex2(rgba.r)}${toHex2(rgba.g)}${toHex2(rgba.b)}`.toUpperCase()
  const hexAlpha = `${hex}${toHex2(Math.round(rgba.a * 255)).toUpperCase()}`
  const hsl = rgbaToHsl(rgba)
  const contrastWhite = contrastRatio(rgba, { r: 255, g: 255, b: 255, a: 1 })
  const contrastBlack = contrastRatio(rgba, { r: 0, g: 0, b: 0, a: 1 })

  return {
    rgba,
    hex,
    hexAlpha,
    rgb: `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`,
    rgbaStr: `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${round2(rgba.a)})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    hsla: `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${round2(rgba.a)})`,
    contrastWhite,
    contrastBlack,
    gradeWhite: wcagGrade(contrastWhite),
    gradeBlack: wcagGrade(contrastBlack),
  }
}

// 2. BigInt-Exact Radix Conversion

export type RadixBase = 2 | 8 | 10 | 16 | 36

export interface RadixResult {
  value: bigint
  binary: string
  octal: string
  decimal: string
  hex: string
  base36: string
  bitLength: number
}

const RADIX_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

export function parseBigIntRadix(input: string, radix: RadixBase): bigint | null {
  let s = input.trim().replace(/[\s_]+/g, '')
  if (!s) return null

  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  if (radix === 2 && /^0b/i.test(s)) s = s.slice(2)
  else if (radix === 8 && /^0o/i.test(s)) s = s.slice(2)
  else if (radix === 16 && /^0x/i.test(s)) s = s.slice(2)

  if (!s) return null
  const lower = s.toLowerCase()
  const base = BigInt(radix)
  let acc = 0n

  for (let i = 0; i < lower.length; i += 1) {
    const idx = RADIX_DIGITS.indexOf(lower[i])
    if (idx === -1 || idx >= radix) return null
    acc = acc * base + BigInt(idx)
  }

  return negative ? -acc : acc
}

export function formatBigIntRadix(val: bigint): RadixResult {
  const abs = val < 0n ? -val : val
  const sign = val < 0n ? '-' : ''
  const binDigits = abs.toString(2)
  return {
    value: val,
    binary: sign + binDigits,
    octal: sign + abs.toString(8),
    decimal: sign + abs.toString(10),
    hex: sign + abs.toString(16).toUpperCase(),
    base36: sign + abs.toString(36).toUpperCase(),
    bitLength: abs === 0n ? 1 : binDigits.length,
  }
}

export function convertRadix(input: string, fromRadix: RadixBase): RadixResult | null {
  const parsed = parseBigIntRadix(input, fromRadix)
  if (parsed === null) return null
  return formatBigIntRadix(parsed)
}

// 3. Byte Unit Conversion

export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB'
export type ByteStandard = 'iec' | 'si'

export const BYTE_UNITS: ByteUnit[] = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export interface ByteConversionRow {
  unit: ByteUnit
  iecLabel: string
  siLabel: string
  value: number
  formatted: string
}

const IEC_LABELS: Record<ByteUnit, string> = {
  B: 'B',
  KB: 'KiB',
  MB: 'MiB',
  GB: 'GiB',
  TB: 'TiB',
  PB: 'PiB',
}

function formatByteNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n === 0) return '0'
  if (Math.abs(n) >= 1e15 || (Math.abs(n) > 0 && Math.abs(n) < 1e-6)) {
    return n.toExponential(4)
  }
  const fixed = n.toFixed(6).replace(/\.?0+$/, '')
  return fixed === '-0' ? '0' : fixed
}

export function convertBytes(
  value: number,
  unit: ByteUnit,
  standard: ByteStandard = 'iec',
): ByteConversionRow[] {
  const safeVal = Number.isFinite(value) && value >= 0 ? value : 0
  const factor = standard === 'iec' ? 1024 : 1000
  const fromPower = BYTE_UNITS.indexOf(unit)
  const bytes = safeVal * factor ** Math.max(0, fromPower)

  return BYTE_UNITS.map((targetUnit, idx) => {
    const converted = bytes / factor ** idx
    return {
      unit: targetUnit,
      iecLabel: IEC_LABELS[targetUnit],
      siLabel: targetUnit,
      value: converted,
      formatted: formatByteNumber(converted),
    }
  })
}
