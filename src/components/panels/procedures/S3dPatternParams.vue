<template>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('procedures.patternMode') }}</span>
    <select class="s3d-input" :value="params.mode" @change="setParams({ mode: inputValue($event) })">
      <option value="linear">{{ t('procedures.patternLinear') }}</option>
      <option value="circular">{{ t('procedures.patternCircular') }}</option>
    </select>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('procedures.count') }}</span>
    <input class="s3d-input" type="number" min="1" step="1" :value="params.count" @change="setCount($event)" @keydown.stop />
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t(circular ? 'procedures.patternAbout' : 'procedures.patternAlong') }}</span>
    <select class="s3d-input" :value="params.axis" @change="setParams({ axis: inputValue($event) })">
      <option value="x">{{ t('contextMenu.red') }}</option>
      <option value="y">{{ t('contextMenu.green') }}</option>
      <option value="z">{{ t('contextMenu.blue') }}</option>
    </select>
  </div>
  <div v-if="!circular" class="s3d-row">
    <span class="s3d-label">{{ t('procedures.spacing') }}</span>
    <input class="s3d-input" :value="lengthText('spacing')" @change="setLength('spacing', $event)" @keydown.stop />
  </div>
  <template v-else>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('procedures.patternAngle') }}</span>
      <input class="s3d-input" :value="angleText" @change="setAngle($event)" @keydown.stop />
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('procedures.patternCenter') }}</span>
      <input class="s3d-input" :value="centerText" @change="setCenter($event)" @keydown.stop />
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MathUtils } from 'three';
import { parseLength, formatAngle } from '../../../core/units';
import { typedAngle } from '../../../tools/modify/rotateAngle';
import { inputValue, useProcedureParams } from '../../../composables/useProcedureParams';
import { t } from '../../../i18n';

/** A pattern procedure: a row (count, axis, spacing) or a circle (count, axis, angle, centre). */
const { editor, procedure, setParams, setCount, setLength, lengthText } = useProcedureParams();
const params = computed(() => procedure.value!.params);
const circular = computed(() => params.value.mode === 'circular');
const angleText = computed(() => formatAngle(MathUtils.degToRad(Number(params.value.angle))));
/** degrees the copies spread over (360 = a full circle) – back to the old value when it is no angle */
const setAngle = (event: Event) => {
  const angle = typedAngle(inputValue(event));
  if (angle !== null && Math.abs(angle) > 1e-9) {
    setParams({ angle: MathUtils.radToDeg(angle) });
  } else {
    (event.target as HTMLInputElement).value = angleText.value;
  }
};
/** the point the circle turns about, as lengths "x; y; z" */
const centerText = computed(() =>
  String(params.value.center ?? '0;0;0')
    .split(';')
    .map((part) => editor.fmt(Number(part) || 0))
    .join('; '),
);
const setCenter = (event: Event) => {
  const parts = inputValue(event)
    .split(';')
    .map((part) => parseLength(part.trim(), editor.model.settings.units));
  if (parts.length === 3 && parts.every((part) => part !== null)) {
    setParams({ center: parts.join(';') });
  } else {
    (event.target as HTMLInputElement).value = centerText.value;
  }
};
</script>
