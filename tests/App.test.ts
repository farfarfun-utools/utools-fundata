import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import { SAMPLES } from '../src/lib/storage'

describe('FunData 15-in-1 Studio App', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v))
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
        clear: () => {
          store.clear()
        },
      },
    })
    delete document.documentElement.dataset.theme
    window.fundata = undefined
    window.utools = undefined
  })

  it('renders 15 decoupled tool cards in Overview and supports category & search filtering', async () => {
    const wrapper = mount(App)
    expect(wrapper.find('[data-testid="overview-grid"]').exists()).toBe(true)
    expect(wrapper.findAll('.tool-card')).toHaveLength(15)

    // Filter by category: security (4 tools: encoding, jwt, hash, idgen)
    await wrapper.find('[data-testid="cat-chip-security"]').trigger('click')
    expect(wrapper.findAll('.tool-card')).toHaveLength(4)

    // Filter by category: textunits (5 tools: color, radix, bytes, diff, textbatch)
    await wrapper.find('[data-testid="cat-chip-textunits"]').trigger('click')
    expect(wrapper.findAll('.tool-card')).toHaveLength(5)

    // Reset to all & filter by search query
    await wrapper.find('[data-testid="cat-chip-all"]').trigger('click')
    await wrapper.find('[data-testid="overview-search-input"]').setValue('jwt')
    expect(wrapper.findAll('.tool-card')).toHaveLength(1)
    expect(wrapper.find('[data-testid="tool-card-jwt"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('switches between tools via card, sidebar, and Command Palette (Ctrl+K)', async () => {
    const wrapper = mount(App)

    // Open Convert tool from overview card
    await wrapper.find('[data-testid="tool-card-convert"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-convert"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="active-tool-title"]').text()).toContain('10 格式万能互转')

    // Switch to Regex via sidebar
    await wrapper.find('[data-testid="nav-tool-regex"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-regex"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="regex-groups-table"]').exists()).toBe(true)

    // Open Command Palette via Ctrl+K and jump to Cron
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="cmd-palette-modal"]').exists()).toBe(true)
    await wrapper.find('[data-testid="cmd-palette-input"]').setValue('cron')
    await wrapper.find('[data-testid="cmd-item-cron"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-cron"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cmd-palette-modal"]').exists()).toBe(false)

    // Return to Overview
    await wrapper.find('[data-testid="back-overview-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="overview-grid"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('toggles theme (system -> light -> dark) and locale (zh-CN <-> en)', async () => {
    const wrapper = mount(App)

    await wrapper.find('[data-testid="theme-btn"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
    await wrapper.find('[data-testid="theme-btn"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await wrapper.find('[data-testid="locale-btn"]').trigger('click')
    expect(wrapper.text()).toContain('All Data Tools · 15')

    wrapper.unmount()
  })

  it('smartly auto-routes onEnter payloads for JWT, Cron, SQL and files', async () => {
    let enterCb: ((action: { code: string; type: string; payload: unknown }) => void) | null = null
    window.fundata = {
      onEnter: vi.fn((cb) => {
        enterCb = cb
        return () => {}
      }),
      openFile: vi.fn(() => null),
      readEntryFiles: vi.fn(() => [{ name: 'schema.proto', content: SAMPLES.protobuf }]),
      saveFile: vi.fn(() => true),
    }

    const wrapper = mount(App)
    expect(enterCb).not.toBeNull()

    // 1. Selected JWT text -> routes to jwt tool
    enterCb!({ code: 'data-over', type: 'over', payload: SAMPLES.jwt })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="tool-jwt"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="jwt-payload-pre"]').text()).toContain('9007199254740999')

    // 2. Selected Cron text -> routes to cron tool
    enterCb!({ code: 'data-over', type: 'over', payload: '*/5 * * * *' })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="tool-cron"]').exists()).toBe(true)
    expect((wrapper.find('[data-testid="cron-input"]').element as HTMLInputElement).value).toBe(
      '*/5 * * * *',
    )

    // 3. Entry .proto file -> routes to proto tool
    enterCb!({ code: 'data-files', type: 'files', payload: [{ path: '/tmp/schema.proto' }] })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="tool-proto"]').exists()).toBe(true)

    // 4. Split feature direct keyword routing (each feature has <= 5 cmds)
    enterCb!({ code: 'fundata-encode', type: 'text', payload: 'jwt' })
    await nextTick()
    expect(wrapper.find('[data-testid="tool-jwt"]').exists()).toBe(true)

    enterCb!({ code: 'fundata-encode', type: 'text', payload: '时间戳' })
    await nextTick()
    expect(wrapper.find('[data-testid="tool-timestamp"]').exists()).toBe(true)

    enterCb!({ code: 'fundata-encode', type: 'text', payload: 'base64' })
    await nextTick()
    expect(wrapper.find('[data-testid="tool-encoding"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="encoding-ts-tab"]').exists()).toBe(false)

    enterCb!({ code: 'fundata-crypto', type: 'text', payload: 'uuid' })
    await nextTick()
    expect(wrapper.find('[data-testid="tool-idgen"]').exists()).toBe(true)

    enterCb!({ code: 'fundata-crypto', type: 'text', payload: 'sha256' })
    await nextTick()
    expect(wrapper.find('[data-testid="tool-hash"]').exists()).toBe(true)

    enterCb!({ code: 'fundata-regex', type: 'text', payload: '文本对比' })
    await nextTick()
    expect(wrapper.find('[data-testid="tool-diff"]').exists()).toBe(true)

    // Verify independent decoupled tools open cleanly from sidebar
    await wrapper.find('[data-testid="nav-tool-textbatch"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-textbatch"]').exists()).toBe(true)
    await wrapper.find('[data-testid="nav-tool-radix"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-radix"]').exists()).toBe(true)
    await wrapper.find('[data-testid="nav-tool-bytes"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-bytes"]').exists()).toBe(true)
    await wrapper.find('[data-testid="nav-tool-color"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-color"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
