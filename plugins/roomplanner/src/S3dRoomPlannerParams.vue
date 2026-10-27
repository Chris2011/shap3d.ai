<template>
  <div class="s3d-rp-params">
    <label v-for="definition in item.params" :key="definition.key" class="s3d-rp-field">
      <span>{{ t(`roomplanner.params.${definition.key}`) }}</span>
      <select
        class="s3d-input"
        :value="String(params[definition.key])"
        @change="change(definition, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in definition.options" :key="String(option)" :value="String(option)">
          {{ optionText(definition, option) }}
        </option>
      </select>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { CatalogItem, ParamDef, ParamValue, Params } from './catalog';
import { t } from './runtime';

/** The choices of a piece (width, finish, doors …) – each one a select. */
const props = defineProps<{ item: CatalogItem; params: Params }>();
const emit = defineEmits<{ (event: 'change', params: Params): void }>();

const optionText = (definition: ParamDef, option: ParamValue) => {
  if (definition.kind === 'material') {
    return t(`roomplanner.materials.${option}`);
  }
  if (typeof option === 'string') {
    return t(`roomplanner.options.${option}`);
  }
  return definition.unit === 'm' ? `${Math.round(option * 100)} cm` : String(option); // i18n-ignore – unit symbol
};

const change = (definition: ParamDef, value: string) => {
  const typed = definition.kind === 'choice' && typeof definition.options[0] === 'number' ? Number(value) : value;
  emit('change', { ...props.params, [definition.key]: typed });
};
</script>
