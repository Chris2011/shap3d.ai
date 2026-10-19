<template>
  <S3dModalDialog v-if="textDialog.open" panel-class="w-105 overflow-auto px-4.5 py-4" @close="cancel">
    <div class="mb-3 text-[0.9375rem] font-semibold">3D-Text einfügen</div>
    <textarea ref="textInput" v-model="form.text" class="s3d-input h-17.5 w-full resize-y px-2 py-1.5" placeholder="Text eingeben" @keydown.ctrl.enter.prevent="place"></textarea>
    <div class="s3d-row">
      <span class="s3d-label">Schriftart</span>
      <select v-model="form.font" class="s3d-input">
        <optgroup v-for="category in categories" :key="category" :label="category">
          <option v-for="font in FONTS.filter(candidate => candidate.category === category)" :key="font.id" :value="font.id">{{ font.label }}</option>
        </optgroup>
      </select>
    </div>
    <!-- preview in the chosen font (CSS), so you see the style before placing -->
    <div class="my-2 flex min-h-16 items-center justify-center overflow-hidden rounded-[3px] border border-line bg-surface-2 px-3 py-2 text-center text-[1.75rem]/tight break-words whitespace-pre-wrap text-ink" :style="{ fontFamily: family }">{{ form.text || ' ' }}</div>
    <div class="mb-1 flex items-center gap-3 text-xs">
      <button class="s3d-link" title="Eine TTF-, OTF- oder WOFF-Datei als Schrift hinzufügen – bleibt im Browser gespeichert" @click="fileInput?.click()">Eigene Schrift laden…</button>
      <button v-if="isCustom" class="s3d-link" @click="removeFont">Diese Schrift entfernen</button>
      <span class="ml-auto text-ink-2">{{ error || (loading ? 'Schrift wird geladen …' : 'Freie Schriften (SIL OFL)') }}</span>
      <input ref="fileInput" type="file" accept=".ttf,.otf,.woff" class="hidden" @change="addFont" />
    </div>
    <div class="s3d-row"><span class="s3d-label">Höhe</span><input v-model="form.size" class="s3d-input" @keydown.stop /></div>
    <label class="s3d-check"><input type="checkbox" v-model="form.filled" /> Gefüllt</label>
    <div class="s3d-row"><span class="s3d-label">Extrudiert</span><input v-model="form.depth" class="s3d-input" :disabled="!form.filled" @keydown.stop /></div>
    <label class="s3d-check"><input type="checkbox" v-model="form.upright" /> Aufrecht stehend</label>
    <div class="mt-3.5 flex justify-end gap-2"><button class="s3d-btn" @click="cancel">Abbrechen</button><button class="s3d-btn primary" :disabled="!form.text.trim() || loading" @click="place">Platzieren</button></div>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import { useEditor } from '../../../components/keys';
import { parseLength } from '../../../core/units';
import { FONTS, findFont, loadFont, previewFamily } from './fonts';
import { start3DText } from './text';
import { textDialog, addCustomFont, removeCustomFont, TEXT_TOOL } from './state';

const editor = useEditor();
const form = textDialog.form;
const textInput = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const family = ref('inherit'); const loading = ref(false); const error = ref('');

const categories = computed(() => [...new Set(FONTS.map(font => font.category))]);
const isCustom = computed(() => findFont(form.font)?.category === 'Eigene');

// load the chosen font right away: preview in the dialog and the outlines for placing
watch(() => [textDialog.open, form.font] as const, async ([open, fontId]) => {
  if (!open) return;
  const font = findFont(fontId) ?? FONTS[0]; form.font = font.id;
  loading.value = true; error.value = '';
  try {
    const [cssFamily] = await Promise.all([previewFamily(font), loadFont(font.id)]);
    if (form.font === font.id) family.value = cssFamily;
  } catch (failure: any) { error.value = failure?.message ?? String(failure); }
  finally { if (form.font === font.id) loading.value = false; }
}, { immediate: true });
watch(() => textDialog.open, open => { if (open) nextTick(() => { textInput.value?.focus(); textInput.value?.select(); }); });

const leaveTool = () => { if (editor.ui.tool === TEXT_TOOL) editor.setTool('select'); };
const cancel = () => { textDialog.open = false; leaveTool(); };
const place = async () => {
  if (!form.text.trim()) return;
  const units = editor.model.settings.units;
  const size = parseLength(form.size, units) ?? 1; const depth = parseLength(form.depth, units) ?? 0;
  textDialog.open = false;
  try { await start3DText(editor, { text: form.text, font: form.font, size, depth, filled: form.filled, upright: form.upright, material: editor.ui.currentMaterial ?? undefined }); }
  catch (failure: any) { editor.toast(failure?.message ?? String(failure)); leaveTool(); }
};
const addFont = async () => {
  const file = fileInput.value?.files?.[0]; if (fileInput.value) fileInput.value.value = '';
  if (!file) return;
  try { form.font = await addCustomFont(file); editor.toast(`Schrift „${file.name}“ hinzugefügt`); }
  catch (failure: any) { error.value = failure?.message ?? String(failure); }
};
const removeFont = async () => {
  const id = form.font; form.font = FONTS[0].id;
  await removeCustomFont(id);
};
</script>
