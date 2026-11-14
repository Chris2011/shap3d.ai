<template>
  <S3dCheckbox class="font-semibold" :model-value="settings.shadows" @update:model-value="set('shadows', $event)">{{
    t('shadows.show')
  }}</S3dCheckbox>
  <S3dSectionTitle>{{ t('shadows.time') }}</S3dSectionTitle>
  <S3dFieldRow>
    <S3dRangeSlider
      class="flex-1"
      min="5"
      max="21"
      step="0.25"
      :aria-label="t('shadows.time')"
      :model-value="settings.shadowHour"
      @update:model-value="set('shadowHour', $event)"
    /><span class="w-18.5 text-end tabular-nums">{{ formatClock(settings.shadowHour) }}</span>
  </S3dFieldRow>
  <S3dSectionTitle>{{ t('shadows.date') }}</S3dSectionTitle>
  <S3dFieldRow>
    <S3dRangeSlider
      class="flex-1"
      min="1"
      max="12"
      step="1"
      :aria-label="t('shadows.date')"
      :model-value="settings.shadowMonth"
      @update:model-value="set('shadowMonth', $event)"
    /><span class="w-18.5 text-end tabular-nums">{{ monthName(settings.shadowMonth, language) }}</span>
  </S3dFieldRow>
  <S3dSectionTitle>{{ t('shadows.latitude') }}</S3dSectionTitle>
  <S3dFieldRow>
    <S3dRangeSlider
      class="flex-1"
      min="-66"
      max="66"
      step="1"
      :aria-label="t('shadows.latitude')"
      :model-value="settings.latitude"
      @update:model-value="set('latitude', $event)"
    /><span class="w-18.5 text-end tabular-nums">{{ settings.latitude }}°</span>
  </S3dFieldRow>
  <S3dSectionTitle>{{ t('shadows.north') }}</S3dSectionTitle>
  <S3dFieldRow>
    <S3dRangeSlider
      class="flex-1"
      min="0"
      max="359"
      step="1"
      :aria-label="t('shadows.north')"
      :model-value="settings.north"
      @update:model-value="set('north', $event)"
    /><span class="w-18.5 text-end tabular-nums">{{ settings.north }}°</span>
  </S3dFieldRow>
  <p class="s3d-label my-3">{{ t('shadows.hint') }}</p>
</template>

<script setup lang="ts">
import S3dCheckbox from '../ui/S3dCheckbox.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../ui/S3dRangeSlider.vue';
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import { useEditor } from '../keys';
import { useModel } from '../../composables/useModel';
import { useModelSettings } from '../../composables/useModelSettings';
import { formatClock, monthName } from '../../utils/dateText';
import { t, language } from '../../i18n';

const editor = useEditor();
// a copy per model change: the same settings object would not re-render the value labels
const settings = useModel(() => ({ ...editor.model.settings }));
const set = useModelSettings();
</script>
