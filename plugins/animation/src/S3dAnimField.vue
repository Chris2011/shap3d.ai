<template>
  <!-- a value with its key diamond: empty – not animated, green – animated, orange – a key at this frame -->
  <label class="s3d-an-field">
    <span>
      <button
        type="button"
        class="s3d-an-diamond"
        :class="{ keyed: status === 'keyed', animated: status === 'animated' }"
        :title="status === 'keyed' ? t('animation.field.unkey') : t('animation.field.key')"
        @click.prevent="emit('key')"
      ></button>
      {{ label }}
    </span>
    <input
      v-if="type === 'color'"
      class="s3d-an-swatch"
      type="color"
      :value="color"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    />
    <input
      v-else
      class="s3d-input"
      type="number"
      :step="step ?? 'any'"
      :min="min"
      :max="max"
      :value="shown"
      @change="emit('change', Number(($event.target as HTMLInputElement).value))"
      @keydown.stop
    />
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { t } from './runtime';

/** one animatable value in the panel: the field changes it as a key at this frame, the diamond keys or unkeys it */
const props = defineProps<{
  label: string;
  value: number | string;
  status: 'none' | 'animated' | 'keyed';
  type?: 'number' | 'color';
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
}>();
const emit = defineEmits<{ change: [value: number | string]; key: [] }>();

const shown = computed(() => (typeof props.value === 'number' ? Number(props.value.toFixed(props.digits ?? 3)) : props.value));
const color = computed(() => String(props.value));
</script>
