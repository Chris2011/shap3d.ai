<template>
  <div class="s3d-menu-item" :class="{ disabled, relative: submenu }" role="menuitem" :aria-disabled="disabled || undefined">
    <span v-if="checked !== undefined" class="inline-block w-3.5 font-bold text-blue">{{ checked ? '✓' : '' }}</span>
    <S3dIcon v-if="icon" :name="icon" :size="18" />
    <span v-else-if="iconSpace" class="w-4.5"></span>
    <slot />
    <span v-if="shortcut" class="sc">{{ shortcut }}</span>
    <S3dIcon v-if="submenu" name="chevron" :size="14" class="ms-auto" />
    <slot name="submenu" />
  </div>
</template>

<script setup lang="ts">
import S3dIcon from '../S3dIcon.vue';

/**
 * One entry of a drop-down or context menu (`s3d-menu-item`): optional ✓ column (`checked` set, true or false),
 * icon (or `iconSpace` to line up with entries that have one), text in the slot, shortcut, and a chevron with
 * the `submenu` slot for a nested menu. `role` and `aria-checked` may be overridden (e.g. `menuitemradio`).
 */
// `checked` defaults to undefined, not false: without it there is no ✓ column
withDefaults(
  defineProps<{ icon?: string; iconSpace?: boolean; shortcut?: string; disabled?: boolean; checked?: boolean; submenu?: boolean }>(),
  { icon: undefined, shortcut: undefined, checked: undefined },
);
</script>
