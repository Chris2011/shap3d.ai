<template>
  <div
    class="flex cursor-pointer items-center gap-2.5 px-3.5 py-1.25 text-[0.8125rem] text-ink"
    role="option"
    :aria-selected="selected"
    :aria-disabled="row.disabled || undefined"
    :class="[selected && 'bg-active', row.disabled && 'cursor-default opacity-45']"
  >
    <S3dIcon :name="row.item.icon ?? 'chevron'" :size="18" />
    <span class="min-w-0 flex-1 truncate"
      ><template v-for="(segment, segmentIndex) in row.segs" :key="segmentIndex"
        ><b v-if="segment.hit" class="font-bold text-brand-deep dark:text-brand">{{ segment.t }}</b
        ><template v-else>{{ segment.t }}</template></template
      ></span
    >
    <span class="whitespace-nowrap text-[0.6875rem] text-ink-2 max-[35rem]:hidden">{{ row.item.group }}</span>
    <S3dToggleSwitch v-if="row.item.checked" :model-value="row.state" small readonly />
    <kbd v-if="row.item.shortcut" class="s3d-kbd">{{ row.item.shortcut }}</kbd>
  </div>
</template>

<script setup lang="ts">
import S3dIcon from '../S3dIcon.vue';
import S3dToggleSwitch from '../ui/S3dToggleSwitch.vue';
import type { PaletteRow } from '../../engine/paletteRows';

/** One entry of the command palette: icon, label with the matched letters bold, group, switch state, shortcut. */
defineProps<{ row: PaletteRow; selected: boolean }>();
</script>
