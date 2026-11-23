<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  evaluateRegex,
  REGEX_FLAGS,
  REGEX_PRESETS,
  type RegexFlag,
  type RegexPreset,
} from '../../lib/regex'
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
const pattern = ref(REGEX_PRESETS[0].pattern)
const flags = ref<RegexFlag[]>([...REGEX_PRESETS[0].flags])
const testText = ref(REGEX_PRESETS[0].sampleText)
const replacement = ref(REGEX_PRESETS[0].replacement)
const rightTab = ref<'groups' | 'replace'>('groups')

const evalResult = computed(() =>
  evaluateRegex(pattern.value, flags.value, testText.value, replacement.value),
)

watch(
  [evalResult, flags],
  ([res]) => {
    if (!res.valid) {
      emit('metrics', isEn.value ? 'Invalid Regex' : '正则语法错误')
    } else {
      emit(
        'metrics',
        `${res.count} ${isEn.value ? 'match(es)' : '处匹配'} · /${flags.value.join('')}`,
      )
    }
  },
  { immediate: true },
)

function toggleFlag(flag: RegexFlag) {
  if (flags.value.includes(flag)) {
    flags.value = flags.value.filter((f) => f !== flag)
  } else {
    flags.value = [...flags.value, flag]
  }
}

function applyPreset(preset: RegexPreset) {
  pattern.value = preset.pattern
  flags.value = [...preset.flags]
  testText.value = preset.sampleText
  replacement.value = preset.replacement
}

function loadSample() {
  applyPreset(REGEX_PRESETS[0])
}

function applyInput(text: string) {
  testText.value = text
}

function getExportPayload() {
  const content =
    rightTab.value === 'replace'
      ? evalResult.value.replaced
      : JSON.stringify(evalResult.value.matches, null, 2)
  return {
    filename: rightTab.value === 'replace' ? 'regex-replaced.txt' : 'regex-matches.json',
    content,
  }
}

defineExpose({ loadSample, applyInput, getExportPayload })
</script>

<template>
  <div class="tool-workspace" data-testid="tool-regex">
    <!-- Pattern + Flags Bar -->
    <div class="tool-toolbar regex-top-bar">
      <div class="regex-pattern-box">
        <span class="regex-slash mono">/</span>
        <input
          v-model="pattern"
          type="text"
          class="regex-pattern-input mono"
          data-testid="regex-pattern-input"
          spellcheck="false"
          :placeholder="isEn ? 'Enter regular expression...' : '输入正则表达式...'"
        />
        <span class="regex-slash mono">/{{ flags.join('') }}</span>
      </div>

      <div class="tool-toolbar-group">
        <button
          v-for="item in REGEX_FLAGS"
          :key="item.flag"
          type="button"
          class="flag-pill mono"
          :class="{ active: flags.includes(item.flag) }"
          :title="isEn ? item.labelEn : item.labelZh"
          @click="toggleFlag(item.flag)"
        >
          {{ item.flag }}
        </button>

        <span
          class="badge"
          data-testid="regex-count-badge"
          :class="!evalResult.valid ? 'badge-danger' : evalResult.count > 0 ? 'badge-success' : 'badge-neutral'"
        >
          <template v-if="!evalResult.valid">
            {{ isEn ? 'Error' : '语法错误' }}
          </template>
          <template v-else>
            {{ evalResult.count }} {{ isEn ? 'matches' : '处匹配' }}
          </template>
        </span>
      </div>
    </div>

    <!-- Preset Bar -->
    <div class="preset-bar">
      <span class="preset-label">{{ isEn ? 'Presets' : '常用预设' }}:</span>
      <button
        v-for="p in REGEX_PRESETS"
        :key="p.id"
        type="button"
        class="chip-btn"
        :class="{ active: pattern === p.pattern }"
        @click="applyPreset(p)"
      >
        {{ isEn ? p.labelEn : p.labelZh }}
      </button>
    </div>

    <div v-if="!evalResult.valid" class="tool-error-banner">
      <AppIcon name="alert-circle" :size="14" />
      <span>{{ evalResult.error }}</span>
    </div>

    <!-- Split Workspace -->
    <div class="tool-split">
      <!-- Left: Test Text + Highlighted Preview -->
      <div class="tool-pane regex-left-pane">
        <div class="regex-sub-pane">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Test Text' : '测试文本' }}</span>
            <button type="button" class="ghost-btn xs" @click="testText = ''">
              {{ isEn ? 'Clear' : '清空' }}
            </button>
          </div>
          <textarea
            v-model="testText"
            class="code-textarea"
            data-testid="regex-text-input"
            spellcheck="false"
          />
        </div>

        <div class="regex-sub-pane regex-highlight-pane">
          <div class="pane-header">
            <span class="pane-title">{{ isEn ? 'Highlighted Matches' : '实时匹配高亮' }}</span>
            <span v-if="evalResult.truncated" class="badge badge-warning">2000+</span>
          </div>
          <div class="highlight-box mono" data-testid="regex-highlight-preview">
            <template v-for="(seg, idx) in evalResult.segments" :key="idx">
              <mark v-if="seg.isMatch" class="rx-mark">{{ seg.text || '∅' }}</mark>
              <span v-else>{{ seg.text }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Right: Capture Groups Table / Replace Preview -->
      <div class="tool-pane">
        <div class="pane-header">
          <div class="seg-control seg-compact">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: rightTab === 'groups' }"
              @click="rightTab = 'groups'"
            >
              {{ isEn ? 'Capture Groups' : '捕获组明细' }} ({{ evalResult.count }})
            </button>
            <button
              type="button"
              class="seg-btn"
              data-testid="regex-replace-tab"
              :class="{ active: rightTab === 'replace' }"
              @click="rightTab = 'replace'"
            >
              {{ isEn ? 'Replace' : '替换预览' }}
            </button>
          </div>

          <button
            type="button"
            class="ghost-btn xs accent"
            @click="emit('copy', rightTab === 'replace' ? evalResult.replaced : JSON.stringify(evalResult.matches, null, 2))"
          >
            <AppIcon name="copy" :size="12" />
            {{ isEn ? 'Copy' : '复制' }}
          </button>
        </div>

        <!-- Groups Table -->
        <div v-if="rightTab === 'groups'" class="groups-wrap" data-testid="regex-groups-table">
          <table v-if="evalResult.matches.length > 0" class="rx-table">
            <thead>
              <tr>
                <th class="col-idx">#</th>
                <th>{{ isEn ? 'Match' : '匹配文本' }}</th>
                <th class="col-pos">{{ isEn ? 'Range' : '位置' }}</th>
                <th>{{ isEn ? 'Groups' : '捕获组' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in evalResult.matches" :key="m.index">
                <td class="col-idx tabular">{{ m.index }}</td>
                <td class="mono match-cell">{{ m.match }}</td>
                <td class="col-pos mono tabular">{{ m.start }}–{{ m.end }}</td>
                <td class="groups-cell">
                  <template v-if="m.groups.length > 0">
                    <span
                      v-for="(g, gIdx) in m.groups"
                      :key="gIdx"
                      class="group-chip mono"
                    >
                      ${{ gIdx + 1 }}={{ g || '""' }}
                    </span>
                  </template>
                  <span v-else class="muted-dash">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-state">
            {{ isEn ? 'No matches found' : '当前文本暂无匹配项' }}
          </div>
        </div>

        <!-- Replace Preview -->
        <div v-else class="replace-wrap" data-testid="regex-replace-panel">
          <div class="replace-input-row">
            <span class="replace-label">{{ isEn ? 'Template' : '替换模板' }}</span>
            <input
              v-model="replacement"
              type="text"
              class="field-input mono replace-input"
              data-testid="regex-replace-input"
              placeholder="$1, $2, $&..."
            />
          </div>
          <textarea
            :value="evalResult.replaced"
            class="code-textarea"
            data-testid="regex-replace-output"
            readonly
            spellcheck="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.regex-top-bar {
  flex-wrap: nowrap;
}

.regex-pattern-box {
  flex: 1;
  min-width: 180px;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-canvas);
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.regex-pattern-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.regex-slash {
  color: var(--accent);
  font-weight: 700;
  font-size: 13px;
  user-select: none;
}

.regex-pattern-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 0 5px;
  font-size: 12.5px;
}

.flag-pill {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  transition: all 130ms ease;
}

.flag-pill:hover {
  border-color: var(--border-accent);
  color: var(--accent);
}

.flag-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.preset-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-canvas);
  flex-shrink: 0;
}

.preset-label {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
}

.regex-left-pane {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  background: var(--border);
}

.regex-sub-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
  overflow: hidden;
}

.highlight-box {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--editor-font-size);
  line-height: 1.65;
}

.rx-mark {
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 3px;
  padding: 1px 2px;
  box-shadow: inset 0 0 0 1px var(--border-accent);
  font-weight: 600;
}

.seg-compact .seg-btn {
  height: 20px;
  font-size: 11px;
  padding: 0 7px;
}

.groups-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.rx-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.rx-table th {
  position: sticky;
  top: 0;
  text-align: left;
  padding: 6px 6px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.rx-table td {
  padding: 6px 6px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.col-idx {
  width: 24px;
  color: var(--text-muted);
}

.col-pos {
  width: 44px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.match-cell {
  color: var(--accent);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.groups-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.group-chip {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  font-size: 11px;
  overflow-wrap: anywhere;
  white-space: nowrap;
}

.muted-dash {
  color: var(--text-muted);
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
}

.replace-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.replace-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.replace-label {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.replace-input {
  flex: 1;
  min-width: 0;
}

@media (max-width: 640px) {
  .regex-top-bar {
    flex-wrap: wrap;
  }
}
</style>
