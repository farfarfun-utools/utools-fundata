import { afterEach, describe, expect, it, vi } from 'vitest'
import { repairJsonWithAi } from '../src/lib/ai-repair'
import {
  convertDataFormatTool,
  decodeJwtTool,
  formatJsonTool,
  FUNDATA_AI_TOOL_HANDLERS,
  jsonToTypesTool,
  queryJsonPathTool,
  registerFunDataAiTools,
} from '../src/lib/ai-tools'
import {
  decodeText,
  encodeText,
  formatTimestamp,
  inspectToken,
  parseDateToTimestamp,
} from '../src/lib/decoders'
import { decodeJwt, verifyJwtHmac } from '../src/lib/jwt'
import { convertJsonKeys, convertKeyName } from '../src/lib/keynaming'
import { renumberProto } from '../src/lib/proto'
import { SAMPLES } from '../src/lib/storage'
import { generateTypes, TARGET_LANGUAGES } from '../src/lib/typegen'

async function signJwt(
  header: Record<string, unknown>,
  payloadJson: string,
  secret: string,
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256',
): Promise<string> {
  const b64u = (bytes: Uint8Array): string => {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  const enc = new TextEncoder()
  const h = b64u(enc.encode(JSON.stringify(header)))
  const p = b64u(enc.encode(payloadJson))
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: { name: hash } },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${p}`))
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`
}

describe('typegen.ts', () => {
  const sample = JSON.stringify({
    user_id: 42,
    createdAt: '2026-11-22',
    type: 'order',
    class: 'premium',
    profile: { name: 'Alice', bio: null },
    items: [
      { id: 1, price: 9.9, tag: 'hot' },
      { id: 2, price: 12 },
    ],
    nested: { item: { id: 3 } },
  })

  it('generates types for all 9 target languages with merged optional array fields and deduped names', () => {
    expect(TARGET_LANGUAGES).toHaveLength(9)
    for (const lang of TARGET_LANGUAGES) {
      const code = generateTypes(sample, lang.id, 'OrderResponse')
      expect(code.length).toBeGreaterThan(20)
    }

    const ts = generateTypes(sample, 'typescript', 'OrderResponse')
    expect(ts).toContain('export interface OrderResponse')
    expect(ts).toContain('tag?: string;')
    expect(ts).toContain('export interface Item2')

    const go = generateTypes(sample, 'go', 'OrderResponse')
    expect(go).toContain('`json:"user_id"`')
    expect(go).toContain('`json:"tag,omitempty"`')

    const rust = generateTypes(sample, 'rust', 'OrderResponse')
    expect(rust).toContain('#[serde(rename = "createdAt")]')
    expect(rust).toContain('pub r#type: String')
    expect(rust).toContain('Option<String>')

    const schema = JSON.parse(generateTypes(sample, 'jsonschema', 'OrderResponse'))
    expect(schema.$schema).toContain('2020-12')
    expect(schema.properties.items.items.required).toContain('id')
    expect(schema.properties.items.items.required).not.toContain('tag')
  })
})

describe('keynaming.ts', () => {
  it('converts individual keys and recursively transforms JSON keys with ignore list', () => {
    expect(convertKeyName('user_profile_id', 'camel')).toBe('userProfileId')
    expect(convertKeyName('XMLHttpRequest', 'snake')).toBe('xml_http_request')
    expect(convertKeyName('user-profile-id', 'pascal')).toBe('UserProfileId')
    expect(convertKeyName('userProfileId', 'kebab')).toBe('user-profile-id')
    expect(convertKeyName('userProfileId', 'constant')).toBe('USER_PROFILE_ID')
    expect(convertKeyName('user_profile_id', 'dot')).toBe('user.profile.id')

    const transformed = JSON.parse(
      convertJsonKeys(
        '{"user_name":"Alice","keep_me":1,"nested_obj":{"created_at":123}}',
        'camel',
        ['keep_me'],
      ),
    )
    expect(transformed).toEqual({
      userName: 'Alice',
      keep_me: 1,
      nestedObj: { createdAt: 123 },
    })
  })
})

describe('decoders.ts', () => {
  it('round-trips all 6 encoding kinds including UTF-8 CJK and emoji', () => {
    const text = '数形万变 FunData 🚀 & <tag> "hi"'
    for (const kind of ['base64', 'url', 'unicode', 'html', 'hex', 'json-string'] as const) {
      const encoded = encodeText(text, kind)
      expect(decodeText(encoded, kind)).toBe(text)
    }
  })

  it('parses and formats timestamps and inspects smart tokens', () => {
    const ts = formatTimestamp(1732272000, 'UTC')
    expect(ts).not.toBeNull()
    expect(ts?.seconds).toBe(1732272000)
    expect(ts?.milliseconds).toBe(1732272000000)
    expect(ts?.iso).toBe('2024-11-22T10:40:00.000Z')

    const parsed = parseDateToTimestamp('2024-11-22T10:40:00.000Z')
    expect(parsed?.seconds).toBe(1732272000)
    expect(parseDateToTimestamp('not-a-date')).toBeNull()

    expect(inspectToken('1732272000').some((i) => i.kind === 'timestamp')).toBe(true)
    expect(inspectToken('#0EA5E9').some((i) => i.kind === 'color' && i.previewColor === '#0EA5E9')).toBe(true)
    expect(inspectToken('rgb(14, 165, 233)').some((i) => i.kind === 'color')).toBe(true)
    expect(inspectToken(encodeText('hello FunData', 'base64')).some((i) => i.kind === 'base64')).toBe(true)
    expect(inspectToken('hello%20FunData').some((i) => i.kind === 'url')).toBe(true)
    expect(inspectToken('\\u6570\\u5f62').some((i) => i.kind === 'unicode' && i.value === '数形')).toBe(true)
    expect(inspectToken('"{\\"k\\":1}"').some((i) => i.kind === 'json-string')).toBe(true)
  })
})

describe('jwt.ts', () => {
  it('decodes JWT, preserves unsafe integers as strings, computes status, and verifies HMAC', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600
    const payloadRaw = `{"sub":"u1","snowflakeId":9007199254740999,"iat":1700000000,"exp":${futureExp}}`
    const token = await signJwt({ alg: 'HS256', typ: 'JWT' }, payloadRaw, 'super-secret', 'SHA-256')

    const decoded = decodeJwt(`Bearer ${token}`)
    expect(decoded.algorithm).toBe('HS256')
    expect(decoded.status).toBe('valid')
    expect(decoded.payload.snowflakeId).toBe('9007199254740999')
    expect(decoded.expiresAt).toBeTruthy()

    const okVerify = await verifyJwtHmac(token, 'super-secret')
    expect(okVerify.valid).toBe(true)
    expect(okVerify.algorithm).toBe('HS256')

    const badVerify = await verifyJwtHmac(token, 'wrong-secret')
    expect(badVerify.valid).toBe(false)

    // HS512 verification
    const token512 = await signJwt({ alg: 'HS512', typ: 'JWT' }, '{"sub":"u2"}', 'secret-512', 'SHA-512')
    expect(decodeJwt(token512).status).toBe('no-exp')
    expect((await verifyJwtHmac(token512, 'secret-512')).valid).toBe(true)

    // Expired & not-yet-valid statuses
    const expiredToken = await signJwt({ alg: 'HS256' }, '{"exp":1000000000}', 's')
    expect(decodeJwt(expiredToken).status).toBe('expired')

    const futureNbf = Math.floor(Date.now() / 1000) + 7200
    const nbfToken = await signJwt({ alg: 'HS256' }, `{"nbf":${futureNbf}}`, 's')
    expect(decodeJwt(nbfToken).status).toBe('not-yet-valid')

    // Built-in sample JWT verifies cleanly and preserves large snowflakeId
    const sampleDecoded = decodeJwt(SAMPLES.jwt)
    expect(sampleDecoded.payload.snowflakeId).toBe('9007199254740999')
    expect((await verifyJwtHmac(SAMPLES.jwt, 'fundata-secret')).valid).toBe(true)
  })
})

describe('proto.ts', () => {
  it('renumbers messages, oneofs, enums with reserved ranges, 19000..19999 skip, and allow_alias', () => {
    const proto = [
      'syntax = "proto3";',
      '',
      'enum Status {',
      '  option allow_alias = true;',
      '  reserved 1;',
      '  STATUS_UNSPECIFIED = 5; // keep comment',
      '  STATUS_RUNNING = 9;',
      '  STATUS_ACTIVE = 9;',
      '  STATUS_DONE = 20;',
      '}',
      '',
      'message Job {',
      '  reserved 2, 4 to 5;',
      '  string id = 10;',
      '  oneof payload {',
      '    string text = 20 [deprecated = true];',
      '    bytes raw = 30;',
      '  }',
      '  map<string, int32> meta = 40;',
      '}',
      '',
      'message Huge {',
      '  reserved 1 to 18999;',
      '  string over_reserved = 5;',
      '}',
    ].join('\n')

    const res = renumberProto(proto)
    expect(res.changes).toBeGreaterThan(0)
    expect(res.output).toContain('STATUS_UNSPECIFIED = 0; // keep comment')
    expect(res.output).toContain('STATUS_RUNNING = 2;')
    expect(res.output).toContain('STATUS_ACTIVE = 2;')
    expect(res.output).toContain('STATUS_DONE = 3;')

    expect(res.output).toContain('string id = 1;')
    expect(res.output).toContain('string text = 3 [deprecated = true];')
    expect(res.output).toContain('bytes raw = 6;')
    expect(res.output).toContain('map<string, int32> meta = 7;')

    // Must skip Protobuf reserved range 19000..19999
    expect(res.output).toContain('string over_reserved = 20000;')
  })
})

describe('ai-tools.ts', () => {
  afterEach(() => {
    delete window.utools
  })

  it('guards null, undefined, and malformed inputs across all 5 AI tool handlers', () => {
    const handlers = Object.values(FUNDATA_AI_TOOL_HANDLERS)
    for (const handler of handlers) {
      expect(handler(null).ok).toBe(false)
      expect(handler(undefined).ok).toBe(false)
      expect(handler({}).ok).toBe(false)
      expect(handler('bad-param').ok).toBe(false)
    }

    expect(formatJsonTool({ input: '{a:1,b:2}', sortKeys: 'desc', indent: 2 }).output).toBe(
      '{\n  "b": 2,\n  "a": 1\n}',
    )
    expect(formatJsonTool({ input: '{"a": 1}', mode: 'minify' }).output).toBe('{"a":1}')
    expect(formatJsonTool({ input: '{broken', repair: false }).ok).toBe(false)
    expect(formatJsonTool({ input: '{"a":1}', indent: 99 }).ok).toBe(false)

    const jp = queryJsonPathTool({ input: '{"items":[10,20,30]}', expression: '$.items[?@ > 15]' })
    expect(jp.ok).toBe(true)
    expect(jp.results).toEqual([20, 30])

    const conv = convertDataFormatTool({ input: '{"a":1}', to: 'yaml' })
    expect(conv.ok).toBe(true)
    expect(conv.output).toContain('a: 1')
    expect(convertDataFormatTool({ input: '{"a":1}', to: 'invalid' }).ok).toBe(false)

    const types = jsonToTypesTool({ input: '{"id":1}', language: 'typescript', rootName: 'User' })
    expect(types.ok).toBe(true)
    expect(types.output).toContain('export interface User')
    expect(jsonToTypesTool({ input: '{"id":1}', language: 'cobol' }).ok).toBe(false)

    expect(decodeJwtTool({ token: 'not.a.jwt' }).ok).toBe(false)
  })

  it('registers all 5 tools matching plugin.json names on window.utools', () => {
    const names: string[] = []
    window.utools = {
      registerTool: (name) => {
        names.push(name)
      },
    }
    const registered = registerFunDataAiTools()
    expect(registered).toEqual([
      'format_json',
      'query_jsonpath',
      'convert_data_format',
      'json_to_types',
      'decode_jwt',
    ])
    expect(names).toEqual(registered)
  })
})

describe('ai-repair.ts', () => {
  afterEach(() => {
    delete window.utools
    vi.restoreAllMocks()
  })

  it('repairs locally, via uTools AI, and via OpenAI-compatible API with timeout/fallback', async () => {
    const local = await repairJsonWithAi("{a: 1, b: 'x',}", { provider: 'local' })
    expect(local.source).toBe('local')
    expect(JSON.parse(local.output)).toEqual({ a: 1, b: 'x' })

    window.utools = {
      ai: vi.fn(async () => ({ content: '```json\n{"fixed": true}\n```' })),
    }
    const viaUtools = await repairJsonWithAi('{fixed: true}', { provider: 'utools-ai' })
    expect(viaUtools.source).toBe('utools-ai')
    expect(JSON.parse(viaUtools.output)).toEqual({ fixed: true })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"via": "openai"}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const viaOpenAi = await repairJsonWithAi('{via: "openai"}', {
      provider: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    })
    expect(viaOpenAi.source).toBe('openai')
    expect(JSON.parse(viaOpenAi.output)).toEqual({ via: 'openai' })

    // Falls back to local repair when remote fails
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    const fallback = await repairJsonWithAi('{ok: 1,}', {
      provider: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
    })
    expect(fallback.source).toBe('local')
    expect(JSON.parse(fallback.output)).toEqual({ ok: 1 })

    // Propagates error when fallbackToLocal is false
    await expect(
      repairJsonWithAi('{ok: 1,}', {
        provider: 'openai',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4o-mini',
        fallbackToLocal: false,
      }),
    ).rejects.toThrow('HTTP 401')
  })
})
