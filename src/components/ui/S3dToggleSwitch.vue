<template>
  <component
    :is="readonly ? 'span' : 'button'"
    :type="readonly ? undefined : 'button'"
    :role="readonly ? undefined : 'switch'"
    :aria-checked="readonly ? undefined : modelValue"
    :aria-label="label"
    :title="readonly ? (modelValue ? t('common.on') : t('common.off')) : undefined"
    class="relative flex-none rounded-full p-0 transition-colors"
    :class="[small ? 'h-3.5 w-6.5' : 'h-5.5 w-9.5', modelValue ? (small ? 'bg-brand-deep' : 'bg-blue') : 'bg-line-2']"
    @click="!readonly && emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.3)] transition-transform"
      :class="[
        small ? 'top-0.5 left-0.5 size-2.5' : 'top-0.75 left-0.75 size-4',
        modelValue && (small ? 'translate-x-3' : 'translate-x-4'),
      ]"
    ></span>
  </component>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
/** On/off switch (v-model). `readonly` only shows the state, e.g. inside a clickable list row. */
defineProps<{ modelValue: boolean; label?: string; small?: boolean; readonly?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();
</script>
