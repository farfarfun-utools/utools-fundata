import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONVERT_FORMATS, convertFormat } from '../src/lib/converter'
import { computeDiff } from '../src/lib/diff'
import {
  DATA_FORMATS,
  detectFormat,
  detectIndent,
  escapeJsonString,
  formatContent,
  getFormatMeta,
  minifyContent,
  parseJsonError,
  parseJsonLike,
  repairJsonLocal,
  sortJsonKeys,
  stripJsonComments,
  unescapeJsonString,
} from '../src/lib/formats'
import { t } from '../src/lib/i18n'
import { JSONPATH_EXAMPLES, runJsonPath } from '../src/lib/jsonpath'
import {
  autoTabName,
  createDefaultWorkspace,
  createTab,
  loadWorkspace,
  pushTabHistory,
  SAMPLES,
  saveWorkspace,
} from '../src/lib/storage'
import { exportTable, jsonToTable } from '../src/lib/table'

describe('formats.ts', () => {
  it('exposes complete metadata for all 18 data formats', () => {
    expect(DATA_FORMATS).toHaveLength(18)
    expect(getFormatMeta('json').isJsonLike).toBe(true)
    expect(getFormatMeta('protobuf').ext).toBe('proto')
  })

  it('detects format by filename priority and content heuristics', () => {
    expect(detectFormat('plain text', 'config.toml')).toBe('toml')
    expect(detectFormat('anything', '/tmp/service.proto')).toBe('protobuf')
    expect(detectFormat('   ')).toBe('json')
    expect(detectFormat('{"a": 1}')).toBe('json')
    expect(detectFormat('// header\n{"a": 1 /* inline */}')).toBe('jsonc')
    expect(detectFormat("{unquoted: 'hello', trailing: true,}")).toBe('json5')
    expect(detectFormat('{"id":1}\n{"id":2}')).toBe('ndjson')
    expect(detectFormat('<?xml version="1.0"?><root><item>1</item></root>')).toBe('xml')
    expect(detectFormat('<!DOCTYPE html><html><body><div>Hi</div></body></html>')).toBe('html')
    expect(detectFormat('syntax = "proto3";\nmessage Foo { string id = 1; }')).toBe('protobuf')
    expect(detectFormat('SELECT id, name FROM users WHERE active = 1')).toBe('sql')
    expect(detectFormat('[db]\nhost = "localhost"\nport = 5432')).toBe('toml')
    expect(detectFormat('; config\n[db]\nhost = localhost\nport = 5432')).toBe('ini')
    expect(detectFormat('name,age\nAlice,30\nBob,25')).toBe('csv')
    expect(detectFormat('name\tage\nAlice\t30\nBob\t25')).toBe('tsv')
    expect(detectFormat('service: demo\nport: 8080\n')).toBe('yaml')
    expect(detectFormat('export interface User { id: string }')).toBe('typescript')
    expect(detectFormat('const x = 42;\nexport function run() { return x }')).toBe('javascript')
    expect(detectFormat('.card { color: red; padding: 8px; }')).toBe('css')
    expect(detectFormat('# Title\n\nSome paragraph')).toBe('markdown')
    expect(detectFormat('just a plain sentence without markers')).toBe('text')
  })

  it('detects indentation style accurately', () => {
    expect(detectIndent('{\n  "a": 1\n}')).toBe('2')
    expect(detectIndent('{\n    "a": 1\n}')).toBe('4')
    expect(detectIndent('{\n\t"a": 1\n}')).toBe('tab')
  })

  it('strips comments while preserving comment-like text inside strings', () => {
    const src = '{\n  "url": "https://example.com/*keep*/", // line comment\n  /* block\n  comment */\n  "escaped": "a \\" // b"\n}'
    const stripped = stripJsonComments(src)
    expect(JSON.parse(stripped)).toEqual({
      url: 'https://example.com/*keep*/',
      escaped: 'a " // b',
    })
  })

  it('parses JSON, JSONC, JSON5 and reports detailed JSON errors', () => {
    expect(parseJsonLike('{"a": 1}')).toEqual({ a: 1 })
    expect(parseJsonLike('/* c */ {"a": 1}')).toEqual({ a: 1 })
    expect(parseJsonLike("{a: 'ok',}")).toEqual({ a: 'ok' })

    expect(parseJsonError('{"ok": true}')).toEqual({ valid: true })
    const emptyErr = parseJsonError('   ')
    expect(emptyErr.valid).toBe(false)
    expect(emptyErr.line).toBe(1)

    const badErr = parseJsonError('{\n  "a": 1,\n  "b": \n}')
    expect(badErr.valid).toBe(false)
    expect(badErr.message).toBeTruthy()
    expect(badErr.line).toBeGreaterThanOrEqual(1)
    expect(badErr.column).toBeGreaterThanOrEqual(1)
  })

  it('formats, minifies, sorts keys, escapes/unescapes, and repairs JSON locally', () => {
    expect(formatContent('{"a":1,"b":[2]}', 'json', '4')).toContain('    "a": 1')
    expect(formatContent("{a:1,b:'x',}", 'json5', '2')).toContain("b: 'x'")
    expect(formatContent('a: 1\nb:\n  c: 2', 'yaml', '2')).toContain('c: 2')
    expect(formatContent('<root><item>1</item></root>', 'xml', '2')).toContain('\n  <item>1</item>\n')
    expect(formatContent('select a,b from users where id=1', 'sql', '2')).toContain('SELECT')
    expect(formatContent('message A {\nstring id = 1;\n}', 'protobuf', '2')).toBe(
      'message A {\n  string id = 1;\n}',
    )

    expect(minifyContent('{\n  "a": 1,\n  "b": 2\n}', 'json')).toBe('{"a":1,"b":2}')
    expect(minifyContent('<root>\n  <a>1</a>\n</root>', 'xml')).toBe('<root><a>1</a></root>')
    expect(minifyContent('SELECT  a,  b\nFROM   users -- comment\nWHERE x = \'a  b\'', 'sql')).toBe(
      "SELECT a, b FROM users WHERE x = 'a  b'",
    )

    const sortedAsc = sortJsonKeys('{"z":1,"a":{"d":2,"b":3}}', 'asc', '2')
    expect(Object.keys(JSON.parse(sortedAsc))).toEqual(['a', 'z'])
    expect(Object.keys(JSON.parse(sortedAsc).a)).toEqual(['b', 'd'])

    const sortedDesc = sortJsonKeys('{"a":1,"z":2}', 'desc', '2')
    expect(Object.keys(JSON.parse(sortedDesc))).toEqual(['z', 'a'])

    const raw = '{"msg":"hello\n\\"world\\""}'
    const escaped = escapeJsonString(raw)
    expect(unescapeJsonString(escaped)).toBe(raw)
    expect(unescapeJsonString(JSON.stringify(raw))).toBe(raw)

    const repaired = repairJsonLocal("{name: 'FunData', items: [1, 2,],}")
    expect(repaired.changed).toBe(true)
    expect(JSON.parse(repaired.output)).toEqual({ name: 'FunData', items: [1, 2] })
  })
})

describe('converter.ts', () => {
  it('supports all 10 data formats and lossless round-trips', () => {
    expect(CONVERT_FORMATS).toHaveLength(10)

    const sampleObj = { name: 'FunData', version: 1, enabled: true, tags: ['a', 'b'] }
    const jsonStr = JSON.stringify(sampleObj)

    // JSON <-> YAML
    const toYaml = convertFormat(jsonStr, 'auto', 'yaml')
    expect(toYaml.detectedFrom).toBe('json')
    const backFromYaml = convertFormat(toYaml.output, 'yaml', 'json')
    expect(JSON.parse(backFromYaml.output)).toEqual(sampleObj)

    // JSON <-> TOML
    const toToml = convertFormat(jsonStr, 'json', 'toml')
    const backFromToml = convertFormat(toToml.output, 'toml', 'json')
    expect(JSON.parse(backFromToml.output)).toEqual(sampleObj)

    // JSON <-> JSON5
    const toJson5 = convertFormat(jsonStr, 'json', 'json5')
    const backFromJson5 = convertFormat(toJson5.output, 'json5', 'json')
    expect(JSON.parse(backFromJson5.output)).toEqual(sampleObj)

    // XML <-> JSON with attributes and repeated children
    const xml = '<catalog id="c1"><book>Alpha</book><book>Beta</book></catalog>'
    const xmlToJson = convertFormat(xml, 'auto', 'json')
    expect(xmlToJson.detectedFrom).toBe('xml')
    expect(JSON.parse(xmlToJson.output)).toEqual({
      catalog: {
        '@attributes': { id: 'c1' },
        book: ['Alpha', 'Beta'],
      },
    })
    const backToXml = convertFormat(xmlToJson.output, 'json', 'xml')
    expect(backToXml.output).toContain('<catalog id="c1">')
    expect(backToXml.output).toContain('<book>Alpha</book>')

    // CSV & TSV with quoted commas/quotes
    const csv = 'name,note\n"Alice, Jr.","Says ""hi"""\nBob,Simple'
    const csvToJson = convertFormat(csv, 'auto', 'json')
    expect(csvToJson.detectedFrom).toBe('csv')
    expect(JSON.parse(csvToJson.output)).toEqual([
      { name: 'Alice, Jr.', note: 'Says "hi"' },
      { name: 'Bob', note: 'Simple' },
    ])
    const jsonToTsv = convertFormat(csvToJson.output, 'json', 'tsv')
    expect(JSON.parse(convertFormat(jsonToTsv.output, 'tsv', 'json').output)).toEqual([
      { name: 'Alice, Jr.', note: 'Says "hi"' },
      { name: 'Bob', note: 'Simple' },
    ])

    // INI <-> JSON with sections
    const ini = 'app = demo\n\n[db]\nhost = localhost\nport = 5432\nssl = true'
    const iniToJson = convertFormat(ini, 'ini', 'json')
    expect(JSON.parse(iniToJson.output)).toEqual({
      app: 'demo',
      db: { host: 'localhost', port: 5432, ssl: true },
    })
    const backToIni = convertFormat(iniToJson.output, 'json', 'ini')
    expect(backToIni.output).toContain('[db]')
    expect(backToIni.output).toContain('port = 5432')

    // NDJSON <-> JSON
    const ndjson = '{"id":1}\n{"id":2}'
    const ndToJson = convertFormat(ndjson, 'auto', 'json')
    expect(ndToJson.detectedFrom).toBe('ndjson')
    expect(JSON.parse(ndToJson.output)).toEqual([{ id: 1 }, { id: 2 }])
    expect(convertFormat(ndToJson.output, 'json', 'ndjson').output).toBe(ndjson)

    // URL Query <-> JSON
    const query = '?q=hello+world&tag=json&tag=yaml'
    const queryToJson = convertFormat(query, 'auto', 'json')
    expect(queryToJson.detectedFrom).toBe('query')
    expect(JSON.parse(queryToJson.output)).toEqual({
      q: 'hello world',
      tag: ['json', 'yaml'],
    })
    const backToQuery = convertFormat(queryToJson.output, 'json', 'query')
    expect(backToQuery.output).toBe('q=hello%20world&tag=json&tag=yaml')
  })
})

describe('jsonpath.ts', () => {
  it('evaluates RFC 9535 expressions and provides 6 curated examples', () => {
    expect(JSONPATH_EXAMPLES).toHaveLength(6)
    for (const example of JSONPATH_EXAMPLES) {
      const res = runJsonPath(SAMPLES.json, example.expression)
      expect(res.error).toBeUndefined()
      expect(res.count).toBeGreaterThan(0)
    }

    const filtered = runJsonPath(SAMPLES.json, '$.users[?@.score >= 95].name')
    expect(filtered.results).toEqual(['Alice Chen'])
    expect(filtered.count).toBe(1)

    const invalidExpr = runJsonPath(SAMPLES.json, '$.users[?bad')
    expect(invalidExpr.error).toBeTruthy()
    expect(invalidExpr.count).toBe(0)

    const emptyExpr = runJsonPath(SAMPLES.json, '   ')
    expect(emptyExpr.error).toBeTruthy()
  })
})

describe('diff.ts', () => {
  it('computes line diffs and semantic JSON diffs ignoring key order', () => {
    const left = '{"b": 2, "a": 1}'
    const right = '{"a": 1, "b": 2}'

    const rawDiff = computeDiff(left, right)
    expect(rawDiff.stats.modified).toBe(1)
    expect(rawDiff.semanticApplied).toBe(false)

    const semanticDiff = computeDiff(left, right, { semanticJson: true })
    expect(semanticDiff.semanticApplied).toBe(true)
    expect(semanticDiff.stats.added).toBe(0)
    expect(semanticDiff.stats.removed).toBe(0)
    expect(semanticDiff.stats.modified).toBe(0)

    const changed = computeDiff('line1\nline2\nline3', 'line1\nline2-mod\nline3\nline4')
    expect(changed.stats.modified).toBe(1)
    expect(changed.stats.added).toBe(1)
    expect(changed.stats.unchanged).toBe(2)
    expect(changed.unified).toContain('+ line4')
  })
})

describe('table.ts', () => {
  it('converts array of objects, single object, and array of primitives and exports formats', () => {
    const arrTable = jsonToTable('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","extra":"x"}]')
    expect(arrTable.columns).toEqual(['id', 'name', 'extra'])
    expect(arrTable.rows).toHaveLength(2)
    expect(arrTable.rows[0].extra).toBe('')

    const objTable = jsonToTable('{"host":"localhost","port":8080}')
    expect(objTable.columns).toEqual(['host', 'port'])
    expect(objTable.rows).toEqual([{ host: 'localhost', port: '8080' }])

    const primTable = jsonToTable('[10, 20, 30]')
    expect(primTable.columns).toEqual(['value'])
    expect(primTable.rows.map((r) => r.value)).toEqual(['10', '20', '30'])

    const csv = exportTable(arrTable.columns, arrTable.rows, 'csv')
    expect(csv).toBe('id,name,extra\n1,Alice,\n2,Bob,x')
    const tsv = exportTable(arrTable.columns, arrTable.rows, 'tsv')
    expect(tsv).toBe('id\tname\textra\n1\tAlice\t\n2\tBob\tx')
    const md = exportTable(arrTable.columns, arrTable.rows, 'markdown')
    expect(md).toContain('| id | name | extra |')
    expect(md).toContain('| --- | --- | --- |')
    const jsonOut = exportTable(arrTable.columns, arrTable.rows, 'json')
    expect(JSON.parse(jsonOut)).toEqual(arrTable.rows)

    const bad = jsonToTable('{invalid')
    expect(bad.error).toBeTruthy()
  })
})

describe('i18n.ts & storage.ts', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    const mockStorage: Storage = {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => {
        store.delete(key)
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
    }
    vi.stubGlobal('localStorage', mockStorage)
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('translates zh-CN and en keys with parameter interpolation', () => {
    expect(t('zh-CN', 'app.name')).toBe('数形万变')
    expect(t('en', 'app.name')).toBe('FunData')
    expect(t('en', 'status.matches', { count: 4 })).toBe('4 matches')
    expect(t('zh-CN', 'status.lineCol', { line: 3, column: 7 })).toBe('第 3 行，第 7 列')
    expect(t('en', 'non.existent.key')).toBe('non.existent.key')
  })

  it('persists workspace, generates smart tab names, and manages history snapshots', () => {
    const initial = loadWorkspace()
    expect(initial.tabs.length).toBeGreaterThanOrEqual(1)

    const tab = createTab({ content: '{"service": "billing-api"}', format: 'json' })
    expect(autoTabName(tab.content, 'json')).toBe('billing-api')
    expect(autoTabName('[1,2,3]', 'json')).toBe('Array[3]')
    expect(autoTabName('message OrderEvent { string id = 1; }', 'protobuf')).toBe('OrderEvent.proto')
    expect(autoTabName('<invoice><id>1</id></invoice>', 'xml')).toBe('<invoice>')

    const withHist1 = pushTabHistory(tab, 'initial')
    expect(withHist1.history).toHaveLength(1)
    // Duplicate snapshot is ignored
    const withHistDup = pushTabHistory(withHist1, 'dup')
    expect(withHistDup.history).toHaveLength(1)
    // Modified content pushes new snapshot
    const withHist2 = pushTabHistory({ ...withHist1, content: '{"service":"v2"}' }, 'edit')
    expect(withHist2.history).toHaveLength(2)

    const ws = createDefaultWorkspace()
    ws.tabs.push(withHist2)
    ws.activeTabId = withHist2.id
    ws.viewMode = 'table'
    saveWorkspace(ws)

    const reloaded = loadWorkspace()
    expect(reloaded.activeTabId).toBe(withHist2.id)
    expect(reloaded.viewMode).toBe('table')
    expect(reloaded.tabs).toHaveLength(2)

    // Handles corrupted localStorage gracefully
    localStorage.setItem('fundata.workspace.v1', '{broken-json')
    const recovered = loadWorkspace()
    expect(recovered.tabs).toHaveLength(1)
  })
})
