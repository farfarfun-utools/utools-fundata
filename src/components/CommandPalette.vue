<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Locale } from '../lib/i18n'
import { TOOL_CATEGORIES, TOOL_REGISTRY, type ActiveView } from '../lib/storage'
import AppIcon, { type IconName } from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  locale: Locale
}>()

const emit = defineEmits<{
  close: []
  select: [view: ActiveView]
}>()

interface PaletteItem {
  id: ActiveView
  icon: IconName
  tone: string
  title: string
  subtitle: string
  categoryLabel: string
  searchText: string
}

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const allItems = computed<PaletteItem[]>(() => {
  const isEn = props.locale === 'en'
  const catMap = new Map(
    TOOL_CATEGORIES.map((c) => [c.id, isEn ? c.labelEn : c.labelZh]),
  )

  const total = TOOL_REGISTRY.length
  const overview: PaletteItem = {
    id: 'overview',
    icon: 'grid',
    tone: 'violet',
    title: isEn ? `Tool Overview (All ${total})` : `工具总览（全部 ${total} 项）`,
    subtitle: isEn ? `Browse all ${total} developer data tools` : `浏览与搜索全部 ${total} 款开发者数据工具`,
    categoryLabel: isEn ? 'Home' : '首页',
    searchText: 'overview home grid all 工具总览 首页 全部',
  }

  const tools = TOOL_REGISTRY.map<PaletteItem>((tool) => ({
    id: tool.id,
    icon: tool.icon,
    tone: tool.tone,
    title: isEn ? tool.nameEn : tool.nameZh,
    subtitle: isEn ? tool.descEn : tool.descZh,
    categoryLabel: catMap.get(tool.category) ?? '',
    searchText: [
      tool.id,
      tool.nameZh,
      tool.nameEn,
      tool.shortZh,
      tool.shortEn,
      tool.descZh,
      tool.descEn,
      ...tool.tags,
      ...tool.keywords,
    ]
      .join(' ')
      .toLowerCase(),
  }))

  return [overview, ...tools]
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allItems.value
  const tokens = q.split(/\s+/).filter(Boolean)
  return allItems.value.filter((item) => tokens.every((tok) => item.searchText.includes(tok)))
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      query.value = ''
      activeIndex.value = 0
      nextTick(() => inputRef.value?.focus())
    }
  },
)

watch(filtered, () => {
  activeIndex.value = 0
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (filtered.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % filtered.value.length
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (filtered.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + filtered.value.length) % filtered.value.length
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = filtered.value[activeIndex.value]
    if (item) choose(item.id)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

function choose(id: ActiveView) {
  emit('select', id)
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    class="modal-backdrop palette-backdrop"
    data-testid="cmd-palette-modal"
    @click.self="emit('close')"
  >
    <div class="palette-card" role="dialog" aria-modal="true">
      <div class="palette-search-row">
        <AppIcon name="search" :size="15" class="search-ico" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="palette-input"
          data-testid="cmd-palette-input"
          :placeholder="
            locale === 'en'
              ? 'Jump to any tool (e.g. yaml, jwt, regex, cron, hash)...'
              : '输入工具名或关键词快速跳转（如 yaml、jwt、正则、cron、hash）...'
          "
          @keydown="handleKeydown"
        />
        <kbd class="kbd-hint">ESC</kbd>
      </div>

      <div class="palette-list">
        <button
          v-for="(item, idx) in filtered"
          :key="item.id"
          type="button"
          class="palette-item"
          :class="{ active: idx === activeIndex }"
          :data-testid="`cmd-item-${item.id}`"
          @mouseenter="activeIndex = idx"
          @click="choose(item.id)"
        >
          <span class="tone-badge palette-badge" :class="`tone-${item.tone}`">
            <AppIcon :name="item.icon" :size="14" />
          </span>
          <span class="palette-text">
            <span class="palette-title">{{ item.title }}</span>
            <span class="palette-sub">{{ item.subtitle }}</span>
          </span>
          <span class="badge badge-neutral">{{ item.categoryLabel }}</span>
        </button>

        <div v-if="filtered.length === 0" class="palette-empty">
          {{ locale === 'en' ? 'No matching tools' : '没有找到匹配的工具' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  align-items: flex-start;
  padding-top: 72px;
}

.palette-card {
  width: 100%;
  max-width: 520px;
  max-height: 440px;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
}

.palette-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}

.search-ico {
  color: var(--text-muted);
}

.palette-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  color: var(--text-primary);
}

.kbd-hint {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-muted);
}

.palette-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.palette-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color 110ms ease;
}

.palette-item.active,
.palette-item:hover {
  background: var(--accent-soft);
}

.palette-badge {
  width: 28px;
  height: 28px;
}

.palette-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.palette-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.palette-sub {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
}
</style>
