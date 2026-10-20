<template>
  <div class="flex min-h-0 flex-col border-t border-line bg-surface-2">
    <div class="flex items-center gap-2 px-2.5 pt-2 pb-1">
      <input v-model="query" class="s3d-input h-7 flex-1" :placeholder="t('apiReference.search')" spellcheck="false" @keydown.stop />
      <span class="whitespace-nowrap text-[0.6875rem] text-muted">{{
        t('apiReference.counts', { commands: entries.length, materials: mats.length })
      }}</span>
    </div>
    <div class="flex gap-0.5 overflow-x-auto border-b border-line px-2.5 pt-0.5">
      <button
        v-for="tabName in TABS"
        :key="tabName"
        class="whitespace-nowrap border-b-2 bg-transparent px-2 py-1.25 text-xs"
        :class="tab === tabName ? 'border-navy font-bold text-navy' : 'border-transparent text-ink-2 hover:text-navy'"
        @click="tab = tabName"
      >
        {{ t(`apiReference.tabs.${tabName}`) }}
      </button>
    </div>

    <div class="flex-1 overflow-auto px-2.5 pt-1 pb-3 select-text">
      <!-- commands -->
      <template v-for="category in shownCats" :key="category">
        <div class="mt-3 mb-1 s3d-caption text-navy">{{ categoryLabel(category) }}</div>
        <div
          v-for="entry in entries.filter((candidate) => candidate.category === category)"
          :key="entry.id"
          class="mb-1.5 border border-line bg-surface px-2.25 py-1.75"
        >
          <div class="flex items-baseline gap-2">
            <span class="text-[0.8125rem] font-bold">{{ entry.title }}</span>
            <span v-if="entry.returns" class="text-[0.6875rem] text-muted" :title="t('apiReference.returns')">→ {{ entry.returns }}</span>
          </div>
          <code
            class="s3d-syntax font-mono text-ink my-0.75 block text-xs/[1.45] break-words whitespace-pre-wrap"
            v-html="highlightJs(entry.signature)"
          ></code>
          <div class="text-xs/[1.4] text-ink">{{ entry.desc }}</div>
          <pre
            class="s3d-syntax font-mono text-ink mt-1.25 overflow-x-auto border border-line bg-surface-2 px-1.75 py-1.25 text-[0.71875rem]/[1.45] whitespace-pre"
            v-html="highlightJs(entry.example)"
          ></pre>
          <div class="mt-1 flex gap-3">
            <button class="s3d-link" :title="t('apiReference.insertTitle')" @click="$emit('insert', entry.example + '\n')">
              {{ t('commands.paste') }}
            </button>
            <button class="s3d-link" :title="t('apiReference.tryTitle')" @click="$emit('try', entry.example)">
              {{ t('apiReference.try') }}
            </button>
            <button class="s3d-link" @click="copy(entry.example, entry.id)">
              {{ copied === entry.id ? `✓ ${t('toast.copied')}` : t('commands.copy') }}
            </button>
          </div>
        </div>
      </template>

      <!-- material library -->
      <template v-if="showMaterials && mats.length">
        <div class="mt-3 mb-1 s3d-caption text-navy">
          {{ t('apiReference.libraryMaterials') }}
          <span class="font-normal tracking-normal text-muted normal-case">– {{ t('apiReference.libraryHint') }} { material: 'Glas' }</span>
        </div>
        <template v-for="materialCategory in MATERIAL_CATEGORIES" :key="materialCategory">
          <div
            v-if="mats.some((material) => material.category === materialCategory)"
            class="mt-2 mb-0.75 text-[0.6875rem] font-semibold text-ink-2"
          >
            {{ materialCategoryLabel(materialCategory) }}
          </div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(9.375rem,1fr))] gap-1">
            <button
              v-for="material in mats.filter((candidate) => candidate.category === materialCategory)"
              :key="material.name"
              class="group flex min-w-0 items-center gap-1.5 border border-line bg-surface px-1.25 py-0.75 text-start text-xs hover:border-navy"
              :title="matTitle(material)"
              @click="$emit('insert', `'${material.name}'`)"
            >
              <span class="relative size-5.5 flex-none overflow-hidden border border-black/15"
                ><span class="absolute inset-0" :style="swatchStyle(material)"></span
              ></span>
              <span class="min-w-0 flex-1 truncate">{{ material.name }}</span>
              <span
                class="px-0.5 text-[0.6875rem] text-blue opacity-0 group-hover:opacity-100"
                :title="t('apiReference.tryMaterial')"
                @click.stop="$emit('try', `s3d.box([0, 0, 0], 1, 1, 1, { material: '${material.name}' });`)"
                >▶</span
              >
            </button>
          </div>
        </template>
        <div class="mt-3 mb-1 s3d-caption text-navy">
          {{ t('apiReference.textures') }}
          <span class="font-normal tracking-normal text-muted normal-case"
            >– {{ t('apiReference.texturesHint') }} s3d.material(name, farbe, { texture: '…' })</span
          >
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(9.375rem,1fr))] gap-1">
          <button
            v-for="texture in textures"
            :key="texture.kind"
            class="flex min-w-0 items-center gap-1.5 border border-line bg-surface px-1.25 py-0.75 text-start text-xs hover:border-navy"
            :title="`texture: '${texture.kind}' – ${t('apiReference.tile', { size: texture.size })}`"
            @click="$emit('insert', `'${texture.kind}'`)"
          >
            <span class="relative size-5.5 flex-none overflow-hidden border border-black/15"
              ><span class="absolute inset-0" :style="swatchStyle({ color: '#c8b8a0', texture: texture.kind })"></span
            ></span>
            <span class="min-w-0 flex-1 truncate"
              ><code class="font-mono text-[0.6875rem] text-syn-b">{{ texture.kind }}</code> {{ texture.label }}</span
            >
          </button>
        </div>
      </template>

      <div v-if="!entries.length && !mats.length" class="py-4 text-[0.8125rem] text-muted">
        {{ t('apiReference.nothingFound', { query }) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useClipboard } from '@vueuse/core';
import { API_CATALOG, API_CATEGORIES, categoryLabel, type ApiCategory } from '../../scripting/catalog';
import {
  MATERIAL_LIBRARY,
  MATERIAL_CATEGORIES,
  categoryLabel as materialCategoryLabel,
  type LibraryMaterial,
} from '../../core/materialLibrary';
import { TEXTURES, TEXTURE_SIZE, type TextureKind } from '../../core/textures';
import { swatchStyle } from '../../utils/materialSwatch';
import { highlight } from '../../scripting/highlight';
import { t, formatNumber } from '../../i18n';

defineEmits<{ (event: 'insert', text: string): void; (event: 'try', code: string): void }>();

/** tab name = message `apiReference.tabs.<tab>` */
type Tab = 'all' | 'shapes' | 'faces' | 'groups' | 'materials' | 'view' | 'helpers';
const TABS: Tab[] = ['all', 'shapes', 'faces', 'groups', 'materials', 'view', 'helpers'];
// i18n-ignore-start – API categories
const TAB_CATS: Record<Tab, ApiCategory[]> = {
  all: API_CATEGORIES,
  shapes: ['Körper'],
  faces: ['Flächen & Linien', 'Flächen bearbeiten'],
  groups: ['Gruppen & Komponenten'],
  materials: ['Materialien'],
  view: ['Ansicht & Szene'],
  helpers: ['Hilfen', 'Plugins'],
};
// i18n-ignore-end

const query = ref('');
const tab = ref<Tab>('all');
const copiedId = ref('');
const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const match = (...parts: string[]) => {
  const search = norm(query.value.trim());
  return !search || search.split(/\s+/).every((word) => parts.some((part) => norm(part).includes(word)));
};

const entries = computed(() =>
  API_CATALOG.filter((entry) => TAB_CATS[tab.value].includes(entry.category) && match(entry.title, entry.signature, entry.desc, entry.id)),
);
const shownCats = computed(() => API_CATEGORIES.filter((category) => entries.value.some((entry) => entry.category === category)));
const showMaterials = computed(() => tab.value === 'all' || tab.value === 'materials');
const mats = computed(() =>
  showMaterials.value
    ? MATERIAL_LIBRARY.filter((material) =>
        match(material.name, material.category, materialCategoryLabel(material.category), material.texture ?? '', material.note ?? ''),
      )
    : [],
);
const textures = computed(() =>
  (Object.keys(TEXTURES) as TextureKind[])
    .filter((kind) => match(kind, TEXTURES[kind], 'textur', 'texture'))
    .map((kind) => ({ kind: kind, label: TEXTURES[kind], size: TEXTURE_SIZE[kind] })),
);

const highlightJs = (code: string) => highlight(code, 'js');

const matTitle = (material: LibraryMaterial) =>
  `${material.name} · ${material.color}${material.texture ? ` · ${t('apiReference.texture', { texture: TEXTURES[material.texture] })}` : ''}${material.opacity != null && material.opacity < 1 ? ` · ${t('apiReference.opaque', { percent: formatNumber(Math.round(material.opacity * 100)) })}` : ''}${material.note ? ' · ' + material.note : ''}\n${t('apiReference.clickToInsert')}`;

// "✓ Kopiert" shows for 1.4 s on the entry that was copied last
const clip = useClipboard({ legacy: true, copiedDuring: 1400 });
const copied = computed(() => (clip.copied.value ? copiedId.value : ''));
const copy = (text: string, id: string) => {
  copiedId.value = id;
  clip.copy(text);
};
</script>
