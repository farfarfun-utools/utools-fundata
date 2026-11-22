import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  computeHashTool,
  convertDataFormatTool,
  decodeJwtTool,
  formatSqlTool,
  FUNDATA_AI_TOOL_HANDLERS,
  parseCronTool,
  registerFunDataAiTools,
} from '../src/lib/ai-tools'
import { SAMPLES } from '../src/lib/storage'

const PLUGIN_JSON_PATH = path.resolve(__dirname, '../utools/plugin.json')
const PLUGIN_MANIFEST = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8')) as {
  tools: Record<string, { description: string; inputSchema: Record<string, unknown> }>
}

describe('FunData AI / MCP Tools & Manifest Parity', () => {
  it('matches utools/plugin.json tool names verbatim', () => {
    const manifestTools = Object.keys(PLUGIN_MANIFEST.tools).sort()
    const runtimeTools = Object.keys(FUNDATA_AI_TOOL_HANDLERS).sort()
    expect(runtimeTools).toEqual(manifestTools)
    expect(runtimeTools).toEqual([
      'compute_hash',
      'convert_data_format',
      'decode_jwt',
      'format_sql',
      'parse_cron',
    ])
  })

  it('registers all 5 tools with window.utools.registerTool', () => {
    const registerTool = vi.fn()
    const prev = window.utools
    window.utools = { registerTool }
    try {
      const names = registerFunDataAiTools()
      expect(names).toHaveLength(5)
      expect(registerTool).toHaveBeenCalledTimes(5)
    } finally {
      window.utools = prev
    }
  })

  it('executes convert_data_format and validates params', () => {
    const res = convertDataFormatTool({ input: '{"a":1,"b":"ok"}', to: 'yaml' })
    expect(res.ok).toBe(true)
    expect(res.detectedFrom).toBe('json')
    expect(res.output).toContain('a: 1')

    expect(convertDataFormatTool({ input: '', to: 'yaml' }).ok).toBe(false)
    expect(convertDataFormatTool({ input: '{}', to: 'invalid' }).ok).toBe(false)
  })

  it('executes decode_jwt and rejects invalid tokens', () => {
    const res = decodeJwtTool({ token: SAMPLES.jwt })
    expect(res.ok).toBe(true)
    expect(res.algorithm).toBe('HS256')
    expect(res.payload?.snowflakeId).toBe('9007199254740999')

    expect(decodeJwtTool({ token: 'not.a.jwt' }).ok).toBe(false)
    expect(decodeJwtTool({}).ok).toBe(false)
  })

  it('executes format_sql for beautify and minify modes', () => {
    const formatted = formatSqlTool({
      input: 'select id, name from users where id = 1',
      dialect: 'postgresql',
      keywordCase: 'upper',
      indent: 2,
    })
    expect(formatted.ok).toBe(true)
    expect(formatted.output).toContain('SELECT')

    const minified = formatSqlTool({
      input: 'SELECT id,\n  name\nFROM users;',
      mode: 'minify',
    })
    expect(minified.ok).toBe(true)
    expect(minified.output).toBe('SELECT id, name FROM users;')

    expect(formatSqlTool({ input: 'SELECT 1', dialect: 'oracle' }).ok).toBe(false)
    expect(formatSqlTool({ input: 'SELECT 1', indent: 3 }).ok).toBe(false)
  })

  it('executes parse_cron and validates count/expression', () => {
    const res = parseCronTool({ expression: '*/5 * * * *', count: 5, timeZone: 'UTC' })
    expect(res.ok).toBe(true)
    expect(res.fieldCount).toBe(5)
    expect(res.nextRuns).toHaveLength(5)
    expect(res.descriptionZh).toContain('5')

    expect(parseCronTool({ expression: 'bad cron' }).ok).toBe(false)
    expect(parseCronTool({ expression: '* * * * *', count: 99 }).ok).toBe(false)
  })

  it('executes compute_hash for md5, sha256, hmac and base64 encoding', async () => {
    const md5 = await computeHashTool({ input: 'abc', algorithm: 'md5' })
    expect(md5.ok).toBe(true)
    expect(md5.digest).toBe('900150983cd24fb0d6963f7d28e17f72')

    const sha = await computeHashTool({ input: 'abc', algorithm: 'sha256', encoding: 'base64' })
    expect(sha.ok).toBe(true)
    expect(sha.digest).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=')

    const hmac = await computeHashTool({
      input: 'what do ya want for nothing?',
      algorithm: 'md5',
      hmacKey: 'Jefe',
    })
    expect(hmac.ok).toBe(true)
    expect(hmac.hmac).toBe(true)
    expect(hmac.digest).toBe('750c783e6ab0b503eaa86e310a5db738')

    expect((await computeHashTool({ input: 'abc', algorithm: 'sha999' })).ok).toBe(false)
  })
})
