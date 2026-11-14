<template>
  <S3dCheckbox :model-value="!!style[field]" @update:model-value="setStyle(field, $event)"><slot /></S3dCheckbox>
</template>

<script setup lang="ts">
import S3dCheckbox from '../../ui/S3dCheckbox.vue';
import type { StyleSettings } from '../../../core/document';
import { useStyleSettings } from '../../../composables/useStyleSettings';

type SwitchKey = { [K in keyof StyleSettings]: StyleSettings[K] extends boolean ? K : never }[keyof StyleSettings];

/** A style switch (edges, sky, ground …) with its text in the slot. */
defineProps<{ field: SwitchKey }>();
const { style, setStyle } = useStyleSettings();
</script>
