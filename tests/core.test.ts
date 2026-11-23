import { describe, expect, it } from 'vitest'
import { convertFormat } from '../src/lib/converter'
import { parseCron } from '../src/lib/cron'
import {
  computeAllHashes,
  computeSingleHash,
  generateIdBatch,
  generateNanoId,
  generateRandomBase64Url,
  generateRandomHex,
  generateUlid,
  generateUuidV4,
} from '../src/lib/crypto'
import {
  decodeText,
  encodeText,
  formatTimestamp,
  parseDateToTimestamp,
} from '../src/lib/decoders'
import { computeDiff } from '../src/lib/diff'
import { decodeJwt, signJwtHmac, verifyJwtHmac } from '../src/lib/jwt'
import { renumberProto } from '../src/lib/proto'
import { evaluateRegex, REGEX_PRESETS } from '../src/lib/regex'
import { formatSqlCode, minifySqlCode } from '../src/lib/sql'
import { detectRouteForInput, SAMPLES } from '../src/lib/storage'
import { computeTextStats, transformText } from '../src/lib/text-tools'
import { convertBytes, convertColor, convertRadix, parseColor } from '../src/lib/units'

describe('1. Converter (10 formats)', () => {
  it('converts across JSON, JSON5, YAML, TOML, XML, CSV, TSV, INI, NDJSON and Query', () => {
    const obj = { service: 'fundata', port: 8443, tls: true }
    const json = JSON.stringify(obj)

    const toYaml = convertFormat(json, 'auto', 'yaml')
    expect(toYaml.detectedFrom).toBe('json')
    expect(toYaml.output).toContain('service: fundata')

    const toToml = convertFormat(toYaml.output, 'auto', 'toml')
    expect(toToml.detectedFrom).toBe('yaml')
    expect(toToml.output).toContain('port = 8443')

    const toXml = convertFormat(toToml.output, 'toml', 'xml')
    expect(toXml.output).toContain('<service>fundata</service>')

    const fromXml = convertFormat(toXml.output, 'auto', 'json')
    expect(fromXml.detectedFrom).toBe('xml')
    expect(JSON.parse(fromXml.output)).toEqual({ root: obj })

    const toIni = convertFormat(json, 'json', 'ini')
    expect(toIni.output).toContain('service = fundata')
    const fromIni = convertFormat(toIni.output, 'ini', 'json')
    expect(JSON.parse(fromIni.output)).toEqual(obj)

    const csv = 'id,name\n1,Alice\n2,Bob'
    const fromCsv = convertFormat(csv, 'auto', 'ndjson')
    expect(fromCsv.detectedFrom).toBe('csv')
    expect(fromCsv.output.split('\n')).toHaveLength(2)

    const toTsv = convertFormat(fromCsv.output, 'auto', 'tsv')
    expect(toTsv.detectedFrom).toBe('ndjson')
    expect(toTsv.output).toContain('id\tname')

    const q = convertFormat('a=1&b=hello%20world&tag=x&tag=y', 'auto', 'json')
    expect(q.detectedFrom).toBe('query')
    expect(JSON.parse(q.output)).toEqual({ a: '1', b: 'hello world', tag: ['x', 'y'] })

    const json5Out = convertFormat(json, 'json', 'json5')
    expect(json5Out.output).toContain("service: 'fundata'")

    // Edge cases: Excel UTF-8 BOM CSV, INI escaped quotes, comment-only YAML, malformed % in query, DOCTYPE XML
    const bomCsv = convertFormat('\uFEFFid,name\n1,Alice', 'csv', 'json')
    expect(JSON.parse(bomCsv.output)).toEqual([{ id: '1', name: 'Alice' }])

    const quotedIni = convertFormat('msg = "say \\"hi\\"; ok"', 'ini', 'json')
    expect(JSON.parse(quotedIni.output)).toEqual({ msg: 'say "hi"; ok' })

    const commentYaml = convertFormat('# only a comment\n', 'yaml', 'json')
    expect(commentYaml.output).toBe('null')

    const badPercentQuery = convertFormat('rate=100%&note=ok', 'query', 'json')
    expect(JSON.parse(badPercentQuery.output)).toEqual({ rate: '100%', note: 'ok' })

    const doctypeXml = convertFormat('<!DOCTYPE note><note><a>1</a></note>', 'xml', 'json')
    expect(JSON.parse(doctypeXml.output)).toEqual({ note: { a: 1 } })
  })
})

describe('2. Decoders & Timestamps', () => {
  it('encodes and decodes Base64, URL, Unicode, HTML, Hex, JSON String losslessly', () => {
    const sample = '数形万变 <FunData> "a&b" 100%'
    for (const kind of ['base64', 'url', 'unicode', 'html', 'hex', 'json-string'] as const) {
      const encoded = encodeText(sample, kind)
      expect(decodeText(encoded, kind)).toBe(sample)
    }
  })

  it('formats Unix seconds/milliseconds across 5 timezones and parses dates', () => {
    const info = formatTimestamp('1700000000', 'UTC')
    expect(info).not.toBeNull()
    expect(info?.seconds).toBe(1700000000)
    expect(info?.milliseconds).toBe(1700000000000)
    expect(info?.iso).toBe('2023-11-14T22:13:20.000Z')
    expect(info?.rfc2822).toContain('2023')
    expect(info?.zones).toHaveLength(5)
    expect(info?.zones.find((z) => z.timeZone === 'Asia/Shanghai')?.formatted).toBe(
      '2023-11-15 06:13:20',
    )

    const parsed = parseDateToTimestamp('2023-11-14T22:13:20.000Z')
    expect(parsed?.seconds).toBe(1700000000)

    // Out-of-range Unicode / HTML code points and consecutive unescaped quotes in json-string
    expect(decodeText('\\u{999999}', 'unicode')).toBe('\\u{999999}')
    expect(decodeText('&#99999999;', 'html')).toBe('&#99999999;')
    expect(decodeText('a""b', 'json-string')).toBe('a""b')
  })
})

describe('3. JWT Decode, Verify & Sign', () => {
  it('decodes sample JWT preserving BigInt snowflakeId and verifies HS256', async () => {
    const decoded = decodeJwt(SAMPLES.jwt)
    expect(decoded.algorithm).toBe('HS256')
    expect(decoded.payload.snowflakeId).toBe('9007199254740999')
    expect(decoded.status).toBe('valid')

    const ok = await verifyJwtHmac(SAMPLES.jwt, 'fundata-secret')
    expect(ok.valid).toBe(true)

    const bad = await verifyJwtHmac(SAMPLES.jwt, 'wrong-secret')
    expect(bad.valid).toBe(false)
  })

  it('signs and verifies HS256 / HS384 / HS512 JWT offline', async () => {
    for (const alg of ['HS256', 'HS384', 'HS512'] as const) {
      const signed = await signJwtHmac(
        { typ: 'JWT' },
        { sub: 'u_99', name: '测试用户', exp: 4102444800 },
        'my-super-secret',
        alg,
      )
      expect(signed.token.split('.')).toHaveLength(3)
      const verified = await verifyJwtHmac(signed.token, 'my-super-secret')
      expect(verified.valid).toBe(true)
      expect(verified.algorithm).toBe(alg)
      const decoded = decodeJwt(signed.token)
      expect(decoded.payload.name).toBe('测试用户')
    }
  })
})

describe('4. Protobuf Renumber', () => {
  it('renumbers message/enum/oneof while skipping reserved & 19000..19999 and keeping allow_alias', () => {
    const res = renumberProto(SAMPLES.protobuf)
    expect(res.changes).toBeGreaterThan(0)
    expect(res.output).toContain('JOB_STATUS_UNSPECIFIED = 0;')
    expect(res.output).toContain('JOB_STATUS_PENDING = 1;')
    expect(res.output).toContain('JOB_STATUS_QUEUED = 1;')
    expect(res.output).toContain('JOB_STATUS_DONE = 2;')
    expect(res.output).toContain('string job_id = 1;')
    // reserved 2, 4 to 6 -> skips 2, next is 3, then skips 4..6, next is 7, 8, 9
    expect(res.output).toContain('JobStatus status = 3;')
    expect(res.output).toContain('string raw_json = 7;')
    expect(res.output).toContain('bytes binary_data = 8;')
    expect(res.output).toContain('map<string, string> labels = 9;')
  })

  it('skips protobuf internal reserved range 19000..19999', () => {
    const proto = [
      'message Big {',
      '  reserved 1 to 18999;',
      '  string a = 50;',
      '}',
    ].join('\n')
    const res = renumberProto(proto)
    expect(res.output).toContain('string a = 20000;')

    // Huge reserved range jumps in O(1) instead of looping millions of times
    const hugeRange = [
      'message Huge {',
      '  reserved 1 to 10000000;',
      '  string a = 1;',
      '}',
    ].join('\n')
    expect(renumberProto(hugeRange).output).toContain('string a = 10000001;')

    // Fully reserved "1 to max" throws cleanly instead of hanging
    const exhausted = [
      'message Exhausted {',
      '  reserved 1 to max;',
      '  string a = 1;',
      '}',
    ].join('\n')
    expect(() => renumberProto(exhausted)).toThrow()
  })
})

describe('5. SQL Formatter & Minifier', () => {
  it('formats and minifies SQL queries cleanly', () => {
    const raw = `select id, name from users where status = 'active -- keep' order by id desc;`
    const formatted = formatSqlCode(raw, { dialect: 'mysql', keywordCase: 'upper', tabWidth: 2 })
    expect(formatted).toContain('SELECT')
    expect(formatted).toContain('\n')

    const minified = minifySqlCode(`${formatted}\n-- trailing comment\n/* block */`)
    expect(minified).not.toContain('\n')
    expect(minified).toContain("'active -- keep'")
    expect(minified).not.toContain('trailing comment')
  })
})

describe('6. Crypto Hash / HMAC & ID Generators', () => {
  it('computes RFC 1321 MD5 and Web Crypto SHA-1/256/384/512 + HMAC', async () => {
    expect(await computeSingleHash('', 'md5')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(await computeSingleHash('abc', 'md5')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(await computeSingleHash('abc', 'sha256')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await computeSingleHash('abc', 'sha256', { encoding: 'HEX' })).toBe(
      'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD',
    )

    // RFC 2104 / RFC 4231 HMAC test vector
    expect(
      await computeSingleHash('what do ya want for nothing?', 'md5', { hmacKey: 'Jefe' }),
    ).toBe('750c783e6ab0b503eaa86e310a5db738')

    const all = await computeAllHashes('FunData', { hmacKey: 'secret' })
    expect(all).toHaveLength(5)
    expect(all.every((r) => r.value.length >= 32)).toBe(true)
  })

  it('generates valid UUID v4, ULID, NanoID, Random Hex and Base64URL secrets', () => {
    expect(generateUuidV4()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(generateUlid(1700000000000)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(generateNanoId(16)).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(generateRandomHex(64)).toMatch(/^[0-9a-f]{64}$/)
    expect(generateRandomBase64Url(32)).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(generateIdBatch('uuid', 10)).toHaveLength(10)
  })
})

describe('7. Regex Lab', () => {
  it('evaluates matches, XSS-safe segments, capture groups, replace preview and guards zero-length loops', () => {
    const emailPreset = REGEX_PRESETS[0]
    const res = evaluateRegex(
      emailPreset.pattern,
      emailPreset.flags,
      emailPreset.sampleText,
      emailPreset.replacement,
    )
    expect(res.valid).toBe(true)
    expect(res.count).toBe(2)
    expect(res.matches[0].groups).toEqual(['support', 'farfarfun.dev'])
    expect(res.segments.filter((s) => s.isMatch)).toHaveLength(2)
    expect(res.replaced).toContain('support [at] farfarfun.dev')

    // Zero-length match must not hang (including Unicode surrogate pairs)
    const zeroLen = evaluateRegex('a*', ['g'], 'bb')
    expect(zeroLen.valid).toBe(true)
    expect(zeroLen.count).toBe(3)

    const emojiZero = evaluateRegex('a*', ['g', 'u'], '🚀b')
    expect(emojiZero.valid).toBe(true)
    expect(emojiZero.segments.map((s) => s.text).join('')).toBe('🚀b')

    // Invalid regex returns structured error
    const bad = evaluateRegex('([unclosed', ['g'], 'abc')
    expect(bad.valid).toBe(false)
    expect(bad.error).toBeTruthy()
  })
})

describe('8. Cron Parser', () => {
  it('parses 5-field and 6-field Cron expressions and calculates next 10 exact runs', () => {
    const base = new Date('2026-01-01T00:00:00.000Z') // Thu 08:00 Asia/Shanghai
    const res5 = parseCron('0 9 * * 1-5', {
      count: 10,
      timeZone: 'Asia/Shanghai',
      fromDate: base,
      locale: 'zh-CN',
    })
    expect(res5.valid).toBe(true)
    expect(res5.fieldCount).toBe(5)
    expect(res5.fields).toHaveLength(5)
    expect(res5.nextRuns).toHaveLength(10)
    expect(res5.nextRuns[0].formatted).toBe('2026-01-01 09:00:00')
    expect(res5.nextRuns[0].relative).toContain('后')
    expect(res5.nextRuns[1].formatted).toBe('2026-01-02 09:00:00')
    // Skips Saturday Jan 3 & Sunday Jan 4 -> Monday Jan 5
    expect(res5.nextRuns[2].formatted).toBe('2026-01-05 09:00:00')
    expect(res5.descriptionZh).toContain('09:00')
    expect(res5.descriptionEn).toContain('09:00')

    const res6 = parseCron('*/30 * * * * *', { count: 4, timeZone: 'UTC', fromDate: base })
    expect(res6.valid).toBe(true)
    expect(res6.fieldCount).toBe(6)
    expect(res6.nextRuns[0].formatted).toBe('2026-01-01 00:00:30')
    expect(res6.nextRuns[1].formatted).toBe('2026-01-01 00:01:00')

    // Standard @daily macro and FRI-SUN wrap-to-Sunday range
    const daily = parseCron('@daily', { count: 2, timeZone: 'UTC', fromDate: base })
    expect(daily.valid).toBe(true)
    expect(daily.nextRuns[0].formatted).toBe('2026-01-02 00:00:00')

    const friSun = parseCron('0 9 * * FRI-SUN', { count: 3, timeZone: 'UTC', fromDate: base })
    expect(friSun.valid).toBe(true)
    expect(friSun.nextRuns[0].formatted).toBe('2026-01-02 09:00:00')
    expect(friSun.nextRuns[2].formatted).toBe('2026-01-04 09:00:00')

    const invalid = parseCron('99 * * * *')
    expect(invalid.valid).toBe(false)
  })
})

describe('9. Color, BigInt Radix & Byte Units', () => {
  it('converts colors across HEX/RGB/HSL with WCAG contrast', () => {
    const parsed = parseColor('#6D4AFF')
    expect(parsed).toEqual({ r: 109, g: 74, b: 255, a: 1 })
    const res = convertColor(parsed!)
    expect(res.hex).toBe('#6D4AFF')
    expect(res.rgb).toBe('rgb(109, 74, 255)')
    expect(res.contrastWhite).toBeGreaterThan(4.5)
    expect(res.gradeWhite).toBe('AA')

    const fromHsl = parseColor('hsl(120, 100%, 50%)')
    expect(fromHsl).toEqual({ r: 0, g: 255, b: 0, a: 1 })
  })

  it('converts BigInt values accurately across bases 2/8/10/16/36', () => {
    const res = convertRadix('9007199254740993', 10)
    expect(res).not.toBeNull()
    expect(res?.decimal).toBe('9007199254740993')
    expect(res?.hex).toBe('20000000000001')
    expect(convertRadix(res!.hex, 16)?.decimal).toBe('9007199254740993')
    expect(convertRadix(res!.binary, 2)?.base36).toBe(res!.base36)
  })

  it('converts byte units in both IEC (1024) and SI (1000)', () => {
    const iec = convertBytes(1, 'GB', 'iec')
    expect(iec.find((r) => r.unit === 'MB')?.value).toBe(1024)
    expect(iec.find((r) => r.unit === 'B')?.value).toBe(1024 ** 3)

    const si = convertBytes(1, 'GB', 'si')
    expect(si.find((r) => r.unit === 'MB')?.value).toBe(1000)
  })
})

describe('10. Text Diff, Batch Ops & Smart Auto-Routing', () => {
  it('computes dual-line diff with ignoreWhitespace option', () => {
    const d1 = computeDiff('a\nb\nc', 'a\n  b  \nc\nd', { ignoreWhitespace: false })
    expect(d1.stats.modified).toBe(1)
    expect(d1.stats.added).toBe(1)

    const d2 = computeDiff('a\nb\nc', 'a\n  b  \nc\nd', { ignoreWhitespace: true })
    expect(d2.stats.modified).toBe(0)
    expect(d2.stats.added).toBe(1)
  })

  it('runs batch transforms and calculates Top 10 line frequency', () => {
    const deduped = transformText('b\na\nb\n', 'dedupe')
    expect(deduped).toBe('b\na\n')
    expect(transformText('b\na\nc', 'sort-asc')).toBe('a\nb\nc')
    expect(transformText('a\n\nb', 'remove-empty')).toBe('a\nb')
    expect(transformText('a\nb', 'affix', { prefix: '[', suffix: ']' })).toBe('[a]\n[b]')

    const stats = computeTextStats('foo\nbar\nfoo\nbaz\nfoo')
    expect(stats.lines).toBe(5)
    expect(stats.topLines[0]).toEqual({ line: 'foo', count: 3, percent: 60 })
  })

  it('routes selected text & filenames to the right studio tool', () => {
    expect(detectRouteForInput(SAMPLES.jwt).tool).toBe('jwt')
    expect(detectRouteForInput('*/5 * * * *').tool).toBe('cron')
    expect(detectRouteForInput('SELECT * FROM users WHERE id = 1').tool).toBe('sql')
    expect(detectRouteForInput(SAMPLES.protobuf).tool).toBe('proto')
    expect(detectRouteForInput('name: alice\nport: 80').tool).toBe('convert')
    expect(detectRouteForInput('1700000000').tool).toBe('timestamp')
    expect(detectRouteForInput('hello%20world').tool).toBe('encoding')
    expect(detectRouteForInput('#6D4AFF').tool).toBe('color')
    expect(detectRouteForInput('0xFF0C').tool).toBe('radix')
    expect(detectRouteForInput('just some plain notes').tool).toBe('textbatch')
    expect(detectRouteForInput('raw', 'schema.proto').tool).toBe('proto')
    expect(detectRouteForInput('raw', 'init.sql').tool).toBe('sql')
  })
})
