import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import App from '../src/App.vue'

function setupMockStorage() {
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
}

describe('App.vue workbench integration', () => {
  beforeEach(() => {
    setupMockStorage()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    delete window.utools
    delete window.funjson
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders initial workbench and registers all 5 uTools AI tools on mount', () => {
    const registered: string[] = []
    window.utools = {
      registerTool: (name) => {
        registered.push(name)
      },
    }

    const wrapper = mount(App)
    expect(wrapper.find('.brand-name').text()).toBe('数形万变')
    expect(wrapper.find('[data-testid="code-editor-host"]').exists()).toBe(true)
    expect(registered).toEqual([
      'format_json',
      'query_jsonpath',
      'convert_data_format',
      'json_to_types',
      'decode_jwt',
    ])
    wrapper.unmount()
  })

  it('switches across all 5 workbench views cleanly (code, tree, columns, table, diff)', async () => {
    const wrapper = mount(App)

    await wrapper.get('[data-testid="view-tree"]').trigger('click')
    expect(wrapper.find('[data-testid="tree-view"]').exists()).toBe(true)

    await wrapper.get('[data-testid="view-columns"]').trigger('click')
    expect(wrapper.find('[data-testid="column-view"]').exists()).toBe(true)

    await wrapper.get('[data-testid="view-table"]').trigger('click')
    expect(wrapper.find('[data-testid="table-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="table-view"] table').exists()).toBe(true)

    await wrapper.get('[data-testid="view-diff"]').trigger('click')
    expect(wrapper.find('[data-testid="diff-view"]').exists()).toBe(true)

    await wrapper.get('[data-testid="view-code"]').trigger('click')
    expect(wrapper.find('[data-testid="code-editor-host"]').exists()).toBe(true)

    // Toggle JSONPath bar in code view
    await wrapper.get('[data-testid="toggle-jsonpath-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="jsonpath-drawer"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="jsonpath-output"]').text()).toContain('Alice Chen')

    wrapper.unmount()
  })

  it('switches to ToolboxView and executes TypeGen, Convert, JWT, and Protobuf tools', async () => {
    const wrapper = mount(App)

    await wrapper.get('[data-testid="ws-toolbox-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="toolbox-view"]').exists()).toBe(true)

    // Types tool
    await wrapper.get('[data-testid="tool-btn-types"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-panel-types"]').exists()).toBe(true)
    const tsOut = (wrapper.get('[data-testid="types-output"]').element as HTMLTextAreaElement).value
    expect(tsOut).toContain('export interface UserPayload')

    // Convert tool
    await wrapper.get('[data-testid="tool-btn-convert"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-panel-convert"]').exists()).toBe(true)
    const yamlOut = (wrapper.get('[data-testid="convert-output"]').element as HTMLTextAreaElement).value
    expect(yamlOut).toContain('service: funjson-workbench')

    // JWT tool
    await wrapper.get('[data-testid="tool-btn-jwt"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-panel-jwt"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="jwt-payload-out"]').text()).toContain('9007199254740999')

    // Protobuf tool
    await wrapper.get('[data-testid="tool-btn-proto"]').trigger('click')
    expect(wrapper.find('[data-testid="tool-panel-proto"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('creates, switches, and closes tabs in multi-tab bar', async () => {
    const wrapper = mount(App)
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(1)

    await wrapper.get('[data-testid="new-tab-btn"]').trigger('click')
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)

    // Switch back to first tab
    const tabs = wrapper.findAll('[role="tab"]')
    await tabs[0].trigger('click')
    expect(tabs[0].attributes('aria-selected')).toBe('true')

    // Close second tab
    await tabs[1].find('.tab-close').trigger('click')
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(1)

    wrapper.unmount()
  })

  it('toggles theme and interface locale', async () => {
    const wrapper = mount(App)

    // Cycle theme: system -> light -> dark
    await wrapper.get('[data-testid="theme-btn"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
    await wrapper.get('[data-testid="theme-btn"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')

    // Toggle locale zh-CN -> en
    await wrapper.get('[data-testid="locale-toggle-btn"]').trigger('click')
    expect(wrapper.find('.brand-name').text()).toBe('FunJSON')

    // Open Settings modal and switch back to zh-CN
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="settings-modal"]').exists()).toBe(true)
    await wrapper.get('[data-testid="locale-zh-btn"]').trigger('click')
    expect(wrapper.find('.brand-name').text()).toBe('数形万变')

    wrapper.unmount()
  })

  it('handles window.funjson.onEnter for json-regex and json-over payloads', async () => {
    let enterHandler: ((action: { code: string; type: string; payload: unknown }) => void) | null = null
    window.funjson = {
      onEnter(cb) {
        enterHandler = cb
        return () => {
          enterHandler = null
        }
      },
      openFile: () => null,
      readEntryFiles: () => [],
      saveFile: () => false,
    }

    const wrapper = mount(App)
    expect(enterHandler).toBeTypeOf('function')

    // json-regex auto-formats and opens a new tab since welcome tab already has content
    enterHandler!({
      code: 'json-regex',
      type: 'regex',
      payload: '{"service":"order-api","count":3}',
    })
    await nextTick()
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
    expect(wrapper.findAll('[role="tab"]')[1].text()).toContain('order-api')

    // json-over detects YAML and opens another tab
    enterHandler!({
      code: 'json-over',
      type: 'over',
      payload: 'service: billing-svc\nport: 9090\n',
    })
    await nextTick()
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="tab"]')[2].text()).toContain('YAML')

    wrapper.unmount()
  })
})
