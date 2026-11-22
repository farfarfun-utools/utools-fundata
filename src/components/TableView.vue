<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { parseJsonLike } from '../lib/formats'
import type { FunJsonSettings } from '../lib/storage'
import { exportTable, jsonToTable } from '../lib/table'

const props = defineProps<{
  content: string
  settings: FunJsonSettings
}>()

const emit = defineEmits<{
  copy: [text: string]
  export: [payload: { filename: string; content: string }]
  'request-repair': []
}>()

const globalQuery = ref('')
const columnFilters = reactive<Record<string, string>>({})
const sortCol = ref<string | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')
const selectedSource = ref<string>('auto')

interface ArraySource {
  id: string
  label: string
  json: string
  count: number
}

const arraySources = computed<ArraySource[]>(() => {
  const sources: ArraySource[] = []
  try {
    const parsed = parseJsonLike(props.content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(val) && val.length > 0 && val.some((item) => item && typeof item === 'object')) {
          sources.push({
            id: `field:${key}`,
            label: `$.${key} (${val.length})`,
            json: JSON.stringify(val),
            count: val.length,
          })
        }
      }
    }
  } catch {
    // ignore
  }
  return sources
})

const effectiveSourceId = computed(() => {
  if (selectedSource.value === 'root') return 'root'
  if (selectedSource.value !== 'auto' && arraySources.value.some((s) => s.id === selectedSource.value)) {
    return selectedSource.value
  }
  return arraySources.value.length > 0 ? arraySources.value[0].id : 'root'
})

const activeTable = computed(() => {
  if (effectiveSourceId.value === 'root') {
    return jsonToTable(props.content)
  }
  const found = arraySources.value.find((s) => s.id === effectiveSourceId.value)
  return jsonToTable(found ? found.json : props.content)
})

watch(
  () => [props.content, effectiveSourceId.value],
  () => {
    for (const k of Object.keys(columnFilters)) {
      delete columnFilters[k]
    }
    sortCol.value = null
  },
)

const filteredAndSortedRows = computed(() => {
  const rows = activeTable.value.rows
  const gq = globalQuery.value.trim().toLowerCase()

  let list = rows.filter((row) => {
    if (gq) {
      const hit = activeTable.value.columns.some((col) => (row[col] ?? '').toLowerCase().includes(gq))
      if (!hit) return false
    }
    for (const [col, filterVal] of Object.entries(columnFilters)) {
      const q = filterVal.trim().toLowerCase()
      if (q && !(row[col] ?? '').toLowerCase().includes(q)) {
        return false
      }
    }
    return true
  })

  if (sortCol.value) {
    const col = sortCol.value
    const dir = sortDir.value === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      const av = a[col] ?? ''
      const bv = b[col] ?? ''
      const an = Number(av)
      const bn = Number(bv)
      if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
        return (an - bn) * dir
      }
      return av.localeCompare(bv) * dir
    })
  }
  return list
})

function toggleSort(col: string) {
  if (sortCol.value !== col) {
    sortCol.value = col
    sortDir.value = 'asc'
  } else if (sortDir.value === 'asc') {
    sortDir.value = 'desc'
  } else {
    sortCol.value = null
  }
}

function handleExport(format: 'csv' | 'tsv' | 'markdown' | 'json') {
  const out = exportTable(activeTable.value.columns, filteredAndSortedRows.value, format)
  const ext = format === 'markdown' ? 'md' : format
  emit('export', { filename: `funjson-table.${ext}`, content: out })
}
</script>

<template>
  <div class="table-view" data-testid="table-view">
    <div class="table-toolbar">
      <input
        v-model="globalQuery"
        type="text"
        class="field-input table-search"
        :placeholder="settings.locale === 'en' ? 'Search all cells...' : '全局搜索表格单元格...'"
        aria-label="Global table search"
      />

      <div v-if="arraySources.length > 0" class="source-chips">
        <button
          v-for="src in arraySources"
          :key="src.id"
          type="button"
          class="chip-btn mono"
          :class="{ active: effectiveSourceId === src.id }"
          @click="selectedSource = src.id"
        >
          {{ src.label }}
        </button>
        <button
          type="button"
          class="chip-btn mono"
          :class="{ active: effectiveSourceId === 'root' }"
          @click="selectedSource = 'root'"
        >
          $ (root)
        </button>
      </div>

      <span v-if="!activeTable.error" class="badge badge-neutral tabular">
        {{ filteredAndSortedRows.length }}/{{ activeTable.rows.length }}
        {{ settings.locale === 'en' ? 'rows' : '行' }} · {{ activeTable.columns.length }}
        {{ settings.locale === 'en' ? 'cols' : '列' }}
      </span>

      <div class="export-group">
        <button type="button" class="pill-btn xs" :disabled="activeTable.columns.length === 0" @click="handleExport('csv')">
          CSV
        </button>
        <button type="button" class="pill-btn xs" :disabled="activeTable.columns.length === 0" @click="handleExport('tsv')">
          TSV
        </button>
        <button type="button" class="pill-btn xs" :disabled="activeTable.columns.length === 0" @click="handleExport('markdown')">
          Markdown
        </button>
        <button type="button" class="pill-btn xs" :disabled="activeTable.columns.length === 0" @click="handleExport('json')">
          JSON
        </button>
      </div>
    </div>

    <div v-if="activeTable.error" class="empty-state">
      <p>{{ settings.locale === 'en' ? 'Cannot render table from invalid JSON' : '当前内容无法转换为表格视图' }}</p>
      <p class="mono err-text">{{ activeTable.error }}</p>
      <button type="button" class="pill-btn primary" @click="emit('request-repair')">
        {{ settings.locale === 'en' ? 'Repair JSON' : '一键修复 JSON' }}
      </button>
    </div>

    <div v-else-if="activeTable.columns.length === 0" class="empty-state">
      <p>{{ settings.locale === 'en' ? 'No tabular data to display' : '当前无表格数据可展示' }}</p>
    </div>

    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="idx-col">#</th>
            <th v-for="col in activeTable.columns" :key="col">
              <div class="th-head">
                <button type="button" class="sort-btn mono" @click="toggleSort(col)">
                  <span>{{ col }}</span>
                  <span class="sort-icon">
                    {{ sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅' }}
                  </span>
                </button>
                <input
                  v-model="columnFilters[col]"
                  type="text"
                  class="col-filter"
                  :placeholder="settings.locale === 'en' ? 'Filter...' : '筛选...'"
                  :aria-label="`Filter ${col}`"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIdx) in filteredAndSortedRows" :key="rowIdx">
            <td class="idx-col tabular">{{ rowIdx + 1 }}</td>
            <td
              v-for="col in activeTable.columns"
              :key="col"
              class="cell-td mono"
              :title="row[col]"
              @click="row[col] && emit('copy', row[col])"
            >
              <span class="cell-text">{{ row[col] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-panel);
}

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.table-search {
  width: 170px;
  height: 26px;
}

.source-chips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.export-group {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-strong);
  border-right: 1px solid var(--border);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}

.th-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 90px;
}

.sort-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.sort-btn:hover {
  color: var(--accent);
}

.sort-icon {
  font-size: 10px;
  color: var(--text-muted);
}

.col-filter {
  width: 100%;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  font-size: 11px;
  outline: none;
}

.col-filter:focus {
  border-color: var(--accent);
}

.data-table tbody tr:nth-child(even) {
  background: var(--bg-subtle);
}

.data-table tbody tr:hover {
  background: var(--accent-soft);
}

.data-table tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  max-width: 240px;
}

.idx-col {
  width: 38px;
  min-width: 38px;
  text-align: center !important;
  color: var(--text-muted);
  font-size: 11px;
}

.cell-td {
  cursor: pointer;
}

.cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
}

.err-text {
  color: var(--danger);
  font-size: 12px;
}
</style>
