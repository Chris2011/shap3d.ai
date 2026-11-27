<template>
  <S3dSectionTitle>{{ part ? t('linework.panel.selected') : t('linework.panel.new') }}</S3dSectionTitle>
  <S3dSegmentedControl v-if="!part" class="mb-2" :model-value="kind" :options="KINDS" @update:model-value="kind = $event as PartKind" />
  <div v-else class="mb-2 font-semibold">{{ t(`linework.kinds.${part.kind}`) }}</div>

  <template v-for="field in FIELDS[shownKind]" :key="field.key">
    <S3dFieldRow :label="t(`linework.fields.${field.key}`)">
      <S3dSelect
        v-if="field.type === 'align'"
        :model-value="String(values[field.key])"
        :aria-label="t(`linework.fields.${field.key}`)"
        @update:model-value="set(field.key, $event)"
      >
        <option v-for="align in ALIGNS" :key="align" :value="align">{{ t(`linework.align.${align}`) }}</option>
      </S3dSelect>
      <S3dTextInput
        v-else
        :model-value="field.type === 'length' ? editor.fmt(Number(values[field.key])) : String(values[field.key])"
        :aria-label="t(`linework.fields.${field.key}`)"
        @commit="set(field.key, $event)"
        @keydown.stop
      />
    </S3dFieldRow>
  </template>
  <p v-if="shownKind === 'stairs'" class="s3d-label my-1">{{ stairHint }}</p>

  <template v-if="!part">
    <p class="s3d-label my-2">{{ t(`linework.hint.${kind}`) }}</p>
    <S3dButton :disabled="!line" @click="create">{{ t('linework.panel.create') }}</S3dButton>
    <p v-if="!line" class="s3d-label mt-1">{{ t('linework.panel.selectLine') }}</p>
  </template>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import S3dButton from '../../../components/ui/S3dButton.vue';
import S3dFieldRow from '../../../components/ui/S3dFieldRow.vue';
import S3dSectionTitle from '../../../components/ui/S3dSectionTitle.vue';
import S3dSegmentedControl from '../../../components/ui/S3dSegmentedControl.vue';
import S3dSelect from '../../../components/ui/S3dSelect.vue';
import S3dTextInput from '../../../components/ui/S3dTextInput.vue';
import { useEditor } from '../../../components/keys';
import { useSelection } from '../../../composables/useModel';
import { parseLength } from '../../../core/units';
import { normalizeNumberInput, t } from '../../../i18n';
import { DEFAULTS, changePart, createPart, partOf, pathFromSelection, type PartKind, type PartParams } from './parts';
import { lineworkContext } from './runtime';

/** Parts from lines: choose wall, stairs or spiral stair and their sizes, build them from the selected line – or change the selected part. */
const editor = useEditor();
const context = lineworkContext();

const KINDS = computed(() => (['wall', 'stairs', 'spiral'] as const).map((value) => ({ value, label: t(`linework.kinds.${value}`) })));
const ALIGNS = ['left', 'center', 'right'] as const;
type Field = { key: string; type: 'length' | 'number' | 'align' };
const FIELDS: Record<PartKind, Field[]> = {
  wall: [
    { key: 'thickness', type: 'length' },
    { key: 'height', type: 'length' },
    { key: 'align', type: 'align' },
  ],
  stairs: [
    { key: 'width', type: 'length' },
    { key: 'height', type: 'length' },
    { key: 'steps', type: 'number' },
  ],
  spiral: [
    { key: 'height', type: 'length' },
    { key: 'steps', type: 'number' },
    { key: 'turn', type: 'number' },
    { key: 'inner', type: 'length' },
    { key: 'thickness', type: 'length' },
  ],
};

const kind = ref<PartKind>('wall');
/** the sizes for new parts, per kind – they stay while the app runs */
const drafts = reactive({ wall: { ...DEFAULTS.wall }, stairs: { ...DEFAULTS.stairs }, spiral: { ...DEFAULTS.spiral } });

const instance = useSelection(() => {
  const selection = editor.selected();
  return selection.length === 1 && selection[0].kind === 'instance' ? editor.entities.instances.get(selection[0].id) : undefined;
});
const part = useSelection(() => {
  const found = partOf(context, instance.value);
  return found && { ...found, params: { ...found.params } };
});
const line = useSelection(() => pathFromSelection(editor));
const shownKind = computed(() => part.value?.kind ?? kind.value);
const values = computed(() => (part.value?.params ?? drafts[kind.value]) as unknown as Record<string, number | string>);

/** a typed value: lengths in the model's unit, numbers as they are – nonsense is left out */
const set = (key: string, text: string) => {
  const field = FIELDS[shownKind.value].find((candidate) => candidate.key === key)!;
  let value: number | string = text;
  if (field.type === 'length') {
    const length = parseLength(text, editor.model.settings.units);
    if (length === null || length < 0 || (length === 0 && key !== 'inner')) {
      return;
    }
    value = length;
  } else if (field.type === 'number') {
    const number = parseFloat(normalizeNumberInput(text).replace(',', '.'));
    if (!Number.isFinite(number) || (key === 'steps' && number < 1)) {
      return;
    }
    value = key === 'steps' ? Math.round(number) : number;
  }
  if (part.value && instance.value) {
    changePart(context, instance.value, { ...part.value.params, [key]: value } as PartParams);
  } else {
    Object.assign(drafts[kind.value], { [key]: value });
  }
};

/** riser and going of the flight shown, so a comfortable stair is easy to find (rule of thumb: 2 risers + 1 going ≈ 63 cm) */
const stairHint = computed(() => {
  const params = values.value as { height: number; steps: number };
  const path = part.value?.path ?? line.value?.points;
  const run = path && path.length > 1 ? Math.hypot(path[path.length - 1][0] - path[0][0], path[path.length - 1][1] - path[0][1]) : 0;
  const riser = params.height / Math.max(1, params.steps);
  return run
    ? t('linework.stairHint', { riser: editor.fmt(riser), going: editor.fmt(run / Math.max(1, params.steps)) })
    : t('linework.stairHintRiser', { riser: editor.fmt(riser) });
});

const create = () => {
  if (!createPart(context, kind.value, drafts[kind.value], t(`linework.kinds.${kind.value}`))) {
    editor.toast(t('linework.panel.selectLine'));
  }
};
</script>
