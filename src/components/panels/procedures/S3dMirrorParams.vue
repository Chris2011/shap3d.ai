<template>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('procedures.mirrorAxis') }}</span>
    <select class="s3d-input" :value="procedure!.params.axis" @change="setAxis(inputValue($event) as MirrorAxis)">
      <option value="x">{{ t('contextMenu.red') }}</option>
      <option value="y">{{ t('contextMenu.green') }}</option>
      <option value="z">{{ t('contextMenu.blue') }}</option>
    </select>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('procedures.mirrorPlane') }}</span>
    <input class="s3d-input" :value="lengthText('at', 0)" @change="setLength('at', $event, false)" @keydown.stop />
  </div>
</template>

<script setup lang="ts">
import { mirrorPlaneAt, type MirrorAxis } from '../../../core/mirrorProcedure';
import { expressionKey } from '../../../core/variableProcedures';
import { inputValue, useProcedureParams } from '../../../composables/useProcedureParams';
import { t } from '../../../i18n';

/** A mirror procedure: the axis its plane lies across and where along it (any length, also 0 or negative). */
const { procedure, sources, setParams, setLength, lengthText } = useProcedureParams();
/** another axis: the plane goes back to the far side of the sources along it */
const setAxis = (axis: MirrorAxis) => setParams({ axis, at: mirrorPlaneAt(sources(), axis), [expressionKey('at')]: undefined });
</script>
