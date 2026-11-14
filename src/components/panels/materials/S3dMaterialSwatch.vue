<template>
  <div
    class="relative aspect-square cursor-pointer rounded-[3px]"
    :class="[{ 'outline-2 outline-offset-1 outline-blue': selected }, cube ? '' : 'border border-line-2']"
    :style="cube ? undefined : swatchStyle(material)"
    :title="material.name"
  >
    <template v-if="cube">
      <span
        v-for="side in CUBE_SIDES"
        :key="side.clip"
        class="absolute inset-0"
        :style="{ ...swatchStyle(material), clipPath: side.clip, filter: side.light }"
      ></span>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MaterialDef } from '../../../core/document';
import { swatchStyle } from '../../../utils/materialSwatch';

/** One material tile: a flat square or a small shaded cube. */
defineProps<{ material: MaterialDef; cube: boolean; selected: boolean }>();
const CUBE_SIDES = [
  { clip: 'polygon(50% 4%, 94% 27%, 50% 50%, 6% 27%)', light: 'brightness(1.1)' },
  { clip: 'polygon(6% 27%, 50% 50%, 50% 96%, 6% 73%)', light: 'brightness(0.85)' },
  { clip: 'polygon(94% 27%, 50% 50%, 50% 96%, 94% 73%)', light: 'brightness(0.65)' },
];
</script>
