<template>
  <S3dModalDialog v-if="textDialog.open" panel-class="w-105 overflow-auto px-4.5 py-4" @close="cancel">
    <div class="mb-3 text-[0.9375rem] font-semibold">{{ t('text3d.dialog.title') }}</div>
    <textarea
      ref="textInput"
      v-model="form.text"
      class="s3d-input h-17.5 w-full resize-y px-2 py-1.5"
      :placeholder="t('text3d.dialog.placeholder')"
      @keydown.ctrl.enter.prevent="place"
    ></textarea>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('text3d.dialog.font') }}</span>
      <select v-model="form.font" class="s3d-input">
        <optgroup v-for="category in categories" :key="category" :label="categoryLabel(category)">
          <option v-for="font in FONTS.filter((candidate) => candidate.category === category)" :key="font.id" :value="font.id">
            {{ fontLabel(font) }}
          </option>
        </optgroup>
      </select>
    </div>
    <!-- preview in the chosen font (CSS), so you see the style before placing -->
    <div
      class="my-2 flex min-h-16 items-center justify-center overflow-hidden rounded-[3px] border border-line bg-surface-2 px-3 py-2 text-center text-[1.75rem]/tight break-words whitespace-pre-wrap text-ink"
      :style="{ fontFamily: family }"
    >
      {{ form.text || ' ' }}
    </div>
    <div class="mb-1 flex items-center gap-3 text-xs">
      <button class="s3d-link" :title="t('text3d.dialog.addFontTitle')" @click="fileInput?.click()">
        {{ t('text3d.dialog.addFont') }}
      </button>
      <button v-if="isCustom" class="s3d-link" @click="removeFont">{{ t('text3d.dialog.removeFont') }}</button>
      <span class="ms-auto text-ink-2">{{ error || (loading ? t('text3d.dialog.loading') : t('text3d.dialog.freeFonts')) }}</span>
      <input ref="fileInput" type="file" accept=".ttf,.otf,.woff" class="hidden" @change="addFont" />
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('text3d.dialog.height') }}</span
      ><input v-model="form.size" class="s3d-input" @keydown.stop />
    </div>
    <label class="s3d-check"><input type="checkbox" v-model="form.filled" /> {{ t('text3d.dialog.filled') }}</label>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('text3d.dialog.depth') }}</span
      ><input v-model="form.depth" class="s3d-input" :disabled="!form.filled" @keydown.stop />
    </div>
    <label class="s3d-check"><input type="checkbox" v-model="form.upright" /> {{ t('text3d.dialog.upright') }}</label>
    <div class="mt-3.5 flex justify-end gap-2">
      <button class="s3d-btn" @click="cancel">{{ t('common.cancel') }}</button
      ><button class="s3d-btn primary" :disabled="!form.text.trim() || loading" @click="place">{{ t('tools.place') }}</button>
    </div>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import { useEditor } from '../../../components/keys';
import { parseLength } from '../../../core/units';
import { FONTS, CUSTOM_CATEGORY, categoryLabel, fontLabel, findFont, loadFont, previewFamily } from './fonts';
import { start3DText } from './text';
import { textDialog, addCustomFont, removeCustomFont, TEXT_TOOL } from './state';
import { t } from '../../../i18n';

const editor = useEditor();
const form = textDialog.form;
const textInput = shallowRef<HTMLTextAreaElement | null>(null);
const fileInput = shallowRef<HTMLInputElement | null>(null);
const family = ref('inherit');
const loading = ref(false);
const error = ref('');

const categories = computed(() => [...new Set(FONTS.map((font) => font.category))]);
const isCustom = computed(() => findFont(form.font)?.category === CUSTOM_CATEGORY);

// load the chosen font right away: preview in the dialog and the outlines for placing
watch(
  () => [textDialog.open, form.font] as const,
  async ([open, fontId]) => {
    if (!open) {
      return;
    }
    const font = findFont(fontId) ?? FONTS[0];
    form.font = font.id;
    loading.value = true;
    error.value = '';
    try {
      const [cssFamily] = await Promise.all([previewFamily(font), loadFont(font.id)]);
      if (form.font === font.id) {
        family.value = cssFamily;
      }
    } catch (failure: any) {
      error.value = failure?.message ?? String(failure);
    } finally {
      if (form.font === font.id) {
        loading.value = false;
      }
    }
  },
  { immediate: true },
);
watch(
  () => textDialog.open,
  (open) => {
    if (open) {
      nextTick(() => {
        textInput.value?.focus();
        textInput.value?.select();
      });
    }
  },
);

const leaveTool = () => {
  if (editor.ui.tool === TEXT_TOOL) {
    editor.setTool('select');
  }
};
const cancel = () => {
  textDialog.open = false;
  leaveTool();
};
const place = async () => {
  if (!form.text.trim()) {
    return;
  }
  const units = editor.model.settings.units;
  const size = parseLength(form.size, units) ?? 1;
  const depth = parseLength(form.depth, units) ?? 0;
  textDialog.open = false;
  try {
    await start3DText(editor, {
      text: form.text,
      font: form.font,
      size,
      depth,
      filled: form.filled,
      upright: form.upright,
      material: editor.ui.currentMaterial ?? undefined,
    });
  } catch (failure: any) {
    editor.toast(failure?.message ?? String(failure));
    leaveTool();
  }
};
const addFont = async () => {
  const file = fileInput.value?.files?.[0];
  if (fileInput.value) {
    fileInput.value.value = '';
  }
  if (!file) {
    return;
  }
  try {
    form.font = await addCustomFont(file);
    editor.toast(t('text3d.dialog.fontAdded', { name: file.name }));
  } catch (failure: any) {
    error.value = failure?.message ?? String(failure);
  }
};
const removeFont = async () => {
  const id = form.font;
  form.font = FONTS[0].id;
  await removeCustomFont(id);
};
</script>
