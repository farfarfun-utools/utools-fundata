<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatSqlCode,
  minifySqlCode,
  SQL_DIALECTS,
  SQL_SAMPLES,
  type SqlDialect,
  type SqlKeywordCase,
} from '../../lib/sql'
import type { FunDataSettings } from '../../lib/storage'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{
  settings: FunDataSettings
}>()

const emit = defineEmits<{
  copy: [text: string]
  export: [payload: { filename: string; content: string }]
  metrics: [summary: string]
}>()

const isEn = computed(() => props.settings.locale === 'en')
const dialect = ref<SqlDialect>('postgresql')
const keywordCase = ref<SqlKeywordCase>('upper')
const tabWidth = ref<2 | 4>(props.settings.defaultIndent === '4' ? 4 : 2)
const mode = ref<'format' | 'minify'>('format')
const inputSql = ref(SQL_SAMPLES[0].sql)

const result = computed(() => {
  if (!inputSql.value.trim()) return { output: '', error: '' }
  try {
    const output =
      mode.value === 'minify'
        ? minifySqlCode(inputSql.value)
        : formatSqlCode(inputSql.value, {
            dialect: dialect.value,
            keywordCase: keywordCase.value,
            tabWidth: tabWidth.value,
          })
    return { output, error: '' }
  } catch (err) {
    return {
      output: '',
      error: err instanceof Error ? err.message : 'SQL format error',
    }
  }
})

watch(
  [inputSql, result, dialect, mode],
  () => {
    const outLines = result.value.output ? result.value.output.split(/\r?\n/).length : 0
    emit(
      'metrics',
      `${dialect.value.toUpperCase()} · ${mode.value === 'minify' ? (isEn.value ? 'Minified' : '已压缩') : `${outLines} ${isEn.value ? 'lines' : '行'}`}`,
    )
  },
  { immediate: true },
)

function pickSample(sample: (typeof SQL_SAMPLES)[number]) {
  dialect.value = sample.dialect
  mode.value = 'format'
  inputSql.value = sample.sql
}

function loadSample() {
  pickSample(SQL_SAMPLES[0])
}

function applyInput(text: string) {
  inputSql.value = text
  mode.value = 'format'
}

function getExportPayload() {
  return {
    filename: `query-${dialect.value}.sql`,
    content: result.value.output || inputSql.value,
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-sql">
    <div class="tool-toolbar">
      <div class="tool-toolbar-group">
        <select v-model="dialect" class="pill-select" data-testid="sql-dialect-select">
          <option v-for="d in SQL_DIALECTS" :key="d.id" :value="d.id">
            {{ d.label }}
          </option>
        </select>

        <select v-model="keywordCase" class="pill-select">
          <option value="upper">{{ isEn ? 'UPPERCASE' : '关键字大写' }}</option>
          <option value="lower">{{ isEn ? 'lowercase' : '关键字小写' }}</option>
          <option value="preserve">{{ isEn ? 'Preserve' : '保留原样' }}</option>
        </select>

        <select v-model.number="tabWidth" class="pill-select">
          <option :value="2">2 Spaces</option>
          <option :value="4">4 Spaces</option>
        </select>

        <div class="seg-control">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: mode === 'format' }"
            @click="mode = 'format'"
          >
            <AppIcon name="wand" :size="12" />
            {{ isEn ? 'Beautify' : '美化' }}
          </button>
          <button
            type="button"
            class="seg-btn"
            data-testid="sql-minify-btn"
            :class="{ active: mode === 'minify' }"
            @click="mode = 'minify'"
          >
            <AppIcon name="minimize" :size="12" />
            {{ isEn ? 'Minify' : '单行压缩' }}
          </button>
        </div>
      </div>

      <div class="tool-toolbar-group">
        <button
          v-for="s in SQL_SAMPLES"
          :key="s.id"
          type="button"
          class="chip-btn"
          @click="pickSample(s)"
        >
          {{ isEn ? s.labelEn : s.labelZh }}
        </button>
      </div>
    </div>

    <div v-if="result.error" class="tool-error-banner">
      <AppIcon name="alert-circle" :size="14" />
      <span>{{ result.error }}</span>
    </div>

    <div class="tool-split">
      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">{{ isEn ? 'SQL Input' : 'SQL 输入' }}</span>
          <button type="button" class="ghost-btn xs" @click="inputSql = ''">
            {{ isEn ? 'Clear' : '清空' }}
          </button>
        </div>
        <textarea
          v-model="inputSql"
          class="code-textarea"
          data-testid="sql-input"
          spellcheck="false"
          :placeholder="isEn ? 'Paste raw SQL query...' : '粘贴待美化或压缩的 SQL 语句...'"
        />
      </div>

      <div class="tool-pane">
        <div class="pane-header">
          <span class="pane-title">
            {{ mode === 'minify' ? (isEn ? 'Minified SQL' : '单行 SQL') : (isEn ? 'Formatted SQL' : '美化结果') }}
          </span>
          <div class="tool-toolbar-group">
            <button
              type="button"
              class="ghost-btn xs accent"
              :disabled="!result.output"
              @click="emit('copy', result.output)"
            >
              <AppIcon name="copy" :size="13" />
              {{ isEn ? 'Copy' : '复制' }}
            </button>
            <button
              type="button"
              class="ghost-btn xs"
              :disabled="!result.output"
              @click="emit('export', getExportPayload())"
            >
              <AppIcon name="download" :size="13" />
              {{ isEn ? 'Export' : '导出' }}
            </button>
          </div>
        </div>
        <textarea
          :value="result.output"
          class="code-textarea"
          data-testid="sql-output"
          readonly
          spellcheck="false"
        />
      </div>
    </div>
  </div>
</template>
