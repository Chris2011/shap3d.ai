<template>
  <button
    type="button"
    class="flex w-full cursor-pointer items-start gap-2 bg-transparent px-4 py-2.25 text-start hover:bg-hover"
    :aria-expanded="open"
  >
    <span class="w-3 pt-px text-navy" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    <div class="min-w-0 flex-1">
      <div class="truncate text-[0.8125rem]">
        <span
          v-if="model.params"
          class="me-1.5 inline-block min-w-7.5 rounded-[3px] px-1 text-center text-[0.65625rem] font-bold"
          :class="PARAM_BADGE[paramClass(model.active ?? model.params)]"
          :title="model.active ? t('ai.search.moeTitle', { active: formatNumber(model.active) }) : t('ai.search.paramsTitle')"
          >{{ formatNumber(model.params) }}B<template v-if="model.active"> · A{{ formatNumber(model.active) }}B</template></span
        ><span class="font-bold text-navy">{{ model.id.split('/')[1] }}</span
        ><span class="ms-1 text-muted">{{ t('pluginManager.by', { author: model.author }) }}</span
        ><span v-if="model.official" class="ms-2 text-[0.6875rem] font-semibold text-ok" :title="t('ai.search.officialTitle')">{{
          t('ai.search.official')
        }}</span
        ><span v-if="!model.chat" class="ms-2 text-[0.6875rem] text-danger" :title="t('ai.search.notChatTitle')">{{
          t('ai.search.notChat')
        }}</span
        ><span v-if="model.gated" class="ms-2 text-[0.6875rem] text-warn" :title="t('ai.search.gatedTitle')">{{
          t('ai.search.gated')
        }}</span>
      </div>
      <div class="mt-0.5 flex flex-wrap gap-3 text-[0.6875rem] text-muted">
        <span :title="t('ai.search.downloadsTitle')">⬇ {{ fmtCount(model.downloads) }}</span>
        <span title="Likes">♥ {{ fmtCount(model.likes) }}</span>
        <span v-if="model.updated" :title="t('ai.search.updated')">{{ formatDay(model.updated) }}</span>
        <span v-if="model.license" class="bg-surface-2 px-1.25">{{ model.license }}</span>
        <span v-if="installed" class="font-bold text-ok">{{ t('ai.wizard.installed') }}</span>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { fmtCount, type HfModel } from '../hfsearch';
import { PARAM_BADGE, formatDay, paramClass } from './hfFormat';
import { t, formatNumber } from '../../../../i18n';

/** One search result: size badge, name, author, flags, downloads, likes, date, licence. A click opens its files. */
defineProps<{ model: HfModel; open: boolean; installed: boolean }>();
</script>
