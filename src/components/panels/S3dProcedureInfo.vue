<template>
  <!-- a procedural group: what it is made with, its parameters and its inputs -->
  <div v-if="procedure" class="mt-2 border-t border-line-2 pt-2">
    <div class="mb-1.5 font-semibold">{{ t(`procedures.kinds.${procedure.kind}`) }}</div>

    <div v-if="procedure.kind === 'solid'" class="s3d-row">
      <span class="s3d-label">{{ t('procedures.operation') }}</span>
      <select class="s3d-input" :value="procedure.params.operation" @change="setParams({ operation: inputValue($event) })">
        <option v-for="operation in PROCEDURE_SOLID_OPS" :key="operation" :value="operation">{{ t(`commands.solid-${operation}`) }}</option>
      </select>
    </div>

    <template v-if="procedure.kind === 'edges'">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('procedures.edgeTreatment') }}</span>
        <select class="s3d-input" :value="procedure.params.treatment" @change="setParams({ treatment: inputValue($event) })">
          <option value="round">{{ t('procedures.round') }}</option>
          <option value="chamfer">{{ t('procedures.chamfer') }}</option>
        </select>
      </div>
      <div class="s3d-row">
        <span class="s3d-label">{{ t(procedure.params.treatment === 'round' ? 'procedures.radius' : 'procedures.chamferWidth') }}</span>
        <input class="s3d-input" :value="lengthText('size')" @change="setLength('size', $event)" @keydown.stop />
      </div>
    </template>

    <template v-if="procedure.kind === 'copyalong'">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('procedures.distribute') }}</span>
        <select class="s3d-input" :value="procedure.params.mode" @change="setParams({ mode: inputValue($event) })">
          <option value="count">{{ t('procedures.byCount') }}</option>
          <option value="spacing">{{ t('procedures.bySpacing') }}</option>
        </select>
      </div>
      <div v-if="procedure.params.mode === 'count'" class="s3d-row">
        <span class="s3d-label">{{ t('procedures.count') }}</span>
        <input class="s3d-input" type="number" min="1" step="1" :value="procedure.params.count" @change="setCount($event)" @keydown.stop />
      </div>
      <div v-else class="s3d-row">
        <span class="s3d-label">{{ t('procedures.spacing') }}</span>
        <input class="s3d-input" :value="lengthText('spacing')" @change="setLength('spacing', $event)" @keydown.stop />
      </div>
      <label class="s3d-check">
        <input
          type="checkbox"
          :checked="!!procedure.params.align"
          @change="setParams({ align: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('procedures.align') }}
      </label>
    </template>

    <S3dMirrorParams v-if="procedure.kind === 'mirror'" />
    <S3dPatternParams v-if="procedure.kind === 'pattern'" />

    <div class="s3d-row">
      <span class="s3d-label">{{ t('procedures.inputs') }}</span>
      <span class="min-w-0 truncate" :title="inputNames">{{ inputNames }}</span>
    </div>
    <p v-if="procedure.error" class="my-1 text-red-600" role="alert">{{ t(procedure.error) }}</p>
    <p class="my-1 text-ink-2">{{ t('procedures.editHint') }}</p>
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button class="s3d-btn" @click="runCommand(editor, 'editGroup')">{{ t('procedures.editInputs') }}</button>
      <button class="s3d-btn" @click="runCommand(editor, 'explodeToInputs')">{{ t('commands.explodeToInputs') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dMirrorParams from './procedures/S3dMirrorParams.vue';
import S3dPatternParams from './procedures/S3dPatternParams.vue';
import { isProcedureInput } from '../../core/model';
import { PROCEDURE_SOLID_OPS } from '../../core/procedures';
import { runCommand } from '../../engine/commands';
import { inputValue, useProcedureParams } from '../../composables/useProcedureParams';
import { t } from '../../i18n';

const { editor, instance, procedure, setParams, setCount, setLength, lengthText } = useProcedureParams();
const inputNames = computed(() =>
  [...(instance.value?.definition.entities.instances.values() ?? [])]
    .filter(isProcedureInput)
    .map((input) => input.name || input.definition.name)
    .join(', '),
);
</script>
