<script setup lang="ts">
import { t } from '../lib/i18n'
import type { FunDataSettings } from '../lib/storage'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  settings: FunDataSettings
}>()

const emit = defineEmits<{
  close: []
  'update:settings': [next: FunDataSettings]
}>()

const TIMEZONES = [
  'Asia/Shanghai',
  'UTC',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
]

function patch(partial: Partial<FunDataSettings>) {
  emit('update:settings', {
    ...props.settings,
    ...partial,
  })
}
</script>

<template>
  <div v-if="open" class="modal-backdrop" data-testid="settings-modal" @click.self="emit('close')">
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">{{ t(settings.locale, 'action.settings') }}</h3>
        <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')">
          <AppIcon name="x" :size="15" />
        </button>
      </div>

      <div class="modal-body settings-body">
        <div class="setting-section">
          <div class="setting-row">
            <span class="setting-label">{{ t(settings.locale, 'settings.theme') }}</span>
            <div class="seg-control">
              <button
                type="button"
                class="seg-btn"
                :class="{ active: settings.theme === 'system' }"
                @click="patch({ theme: 'system' })"
              >
                {{ t(settings.locale, 'settings.themeSystem') }}
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ active: settings.theme === 'light' }"
                @click="patch({ theme: 'light' })"
              >
                {{ t(settings.locale, 'settings.themeLight') }}
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ active: settings.theme === 'dark' }"
                @click="patch({ theme: 'dark' })"
              >
                {{ t(settings.locale, 'settings.themeDark') }}
              </button>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">{{ t(settings.locale, 'settings.locale') }}</span>
            <div class="seg-control">
              <button
                type="button"
                class="seg-btn"
                data-testid="locale-zh-btn"
                :class="{ active: settings.locale === 'zh-CN' }"
                @click="patch({ locale: 'zh-CN' })"
              >
                简体中文
              </button>
              <button
                type="button"
                class="seg-btn"
                data-testid="locale-en-btn"
                :class="{ active: settings.locale === 'en' }"
                @click="patch({ locale: 'en' })"
              >
                English
              </button>
            </div>
          </div>
        </div>

        <div class="setting-section">
          <div class="setting-row">
            <span class="setting-label">{{ t(settings.locale, 'settings.indent') }}</span>
            <div class="seg-control">
              <button
                type="button"
                class="seg-btn"
                :class="{ active: settings.defaultIndent === '2' }"
                @click="patch({ defaultIndent: '2' })"
              >
                2 Spaces
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ active: settings.defaultIndent === '4' }"
                @click="patch({ defaultIndent: '4' })"
              >
                4 Spaces
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ active: settings.defaultIndent === 'tab' }"
                @click="patch({ defaultIndent: 'tab' })"
              >
                Tab
              </button>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">{{ t(settings.locale, 'settings.fontSize') }}</span>
            <div class="font-size-control">
              <input
                type="range"
                min="12"
                max="16"
                step="1"
                :value="settings.fontSize"
                @input="patch({ fontSize: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="badge badge-neutral tabular">{{ settings.fontSize }}px</span>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">{{ t(settings.locale, 'settings.timeZone') }}</span>
            <select
              class="pill-select"
              :value="settings.timeZone"
              @change="patch({ timeZone: ($event.target as HTMLSelectElement).value })"
            >
              <option v-if="!TIMEZONES.includes(settings.timeZone)" :value="settings.timeZone">
                {{ settings.timeZone }}
              </option>
              <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
            </select>
          </div>
        </div>

        <div class="privacy-note">
          <AppIcon name="shield-check" :size="14" />
          <span>
            {{
              settings.locale === 'en'
                ? '100% offline execution. No telemetry, no network calls, preferences stored locally.'
                : '100% 本地离线运行，无埋点、无网络请求，所有数据与偏好仅保存在本机。'
            }}
          </span>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="pill-btn primary" @click="emit('close')">
          {{ settings.locale === 'en' ? 'Done' : '完成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-subtle);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.setting-label {
  font-size: 12.5px;
  font-weight: 500;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.privacy-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
}
</style>
