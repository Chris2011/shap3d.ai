<template>
  <template v-if="details">
    <S3dSectionTitle>{{ t('components.selected') }}</S3dSectionTitle>
    <S3dFieldRow :label="t('entityInfo.definition')">
      <S3dTextInput :model-value="details.name" :aria-label="t('entityInfo.definition')" @commit="rename" @keydown.stop />
    </S3dFieldRow>
    <S3dFieldRow :label="t('components.description')">
      <S3dTextInput
        :model-value="details.description"
        :aria-label="t('components.description')"
        :placeholder="t('components.noDescription')"
        @commit="describe"
        @keydown.stop
      />
    </S3dFieldRow>
    <S3dFieldRow :label="t('components.copies')">{{ details.count }}</S3dFieldRow>
    <S3dFieldRow label="">
      <S3dButton small @click="selectCopies">{{ t('components.selectCopies') }}</S3dButton>
    </S3dFieldRow>
    <S3dFieldRow v-if="others.length" :label="t('components.replaceWith')">
      <S3dSelect model-value="" :aria-label="t('components.replaceWith')" @update:model-value="replace(String($event))">
        <option value="" disabled>{{ t('components.choose') }}</option>
        <option v-for="other in others" :key="other.id" :value="String(other.id)">{{ other.name }}</option>
      </S3dSelect>
    </S3dFieldRow>
  </template>
</template>

<script setup lang="ts">
import S3dButton from '../ui/S3dButton.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import S3dSelect from '../ui/S3dSelect.vue';
import S3dTextInput from '../ui/S3dTextInput.vue';
import { useEditor } from '../keys';
import { useSelection } from '../../composables/useModel';
import type { Definition, Entities } from '../../core/model';
import { t } from '../../i18n';

/** The component of the selection: its name and description, its copies, and swapping the selected copies for another. */
const props = defineProps<{ counts: Map<Definition, number> }>();
const editor = useEditor();

/** the component the selected copies are of – one component, however many copies */
const definition = useSelection(() => {
  const definitions = new Set(
    editor
      .selected()
      .map((entityRef) => (entityRef.kind === 'instance' ? editor.entities.instances.get(entityRef.id)?.definition : undefined))
      .filter((candidate) => candidate?.isComponent),
  );
  return definitions.size === 1 ? [...definitions][0]! : null;
});
const details = useSelection(() => {
  const current = definition.value;
  return current && { name: current.name, description: current.description ?? '', count: props.counts.get(current) ?? 0 };
});
const others = useSelection(() =>
  [...editor.model.definitions.values()].filter((candidate) => candidate.isComponent && candidate !== definition.value),
);

const rename = (name: string) => {
  const current = definition.value;
  if (current && name.trim() && name.trim() !== current.name) {
    editor.commit('undo.renameDefinition', () => (current.name = name.trim()));
  }
};
const describe = (text: string) => {
  const current = definition.value;
  if (current && text.trim() !== (current.description ?? '')) {
    editor.commit('components.undoDescription', () => (current.description = text.trim() || undefined));
  }
};
/** every copy in the open group (or the model) – copies inside other groups are not part of this context */
const selectCopies = () => {
  const current = definition.value;
  const copies = [...editor.entities.instances.values()].filter((instance) => instance.definition === current);
  editor.select(copies.map((instance) => ({ kind: 'instance' as const, id: instance.id })));
};
/** the selected copies show another component; where they are, their tag and material stay */
const replace = (id: string) => {
  const target = editor.model.definitions.get(Number(id));
  const current = definition.value;
  if (!target || !current) {
    return;
  }
  const entities: Entities = editor.entities;
  editor.commit('components.undoReplace', () => {
    for (const entityRef of editor.selected()) {
      const instance = entityRef.kind === 'instance' ? entities.instances.get(entityRef.id) : undefined;
      if (instance?.definition === current) {
        instance.definition = target;
      }
    }
  });
};
</script>
