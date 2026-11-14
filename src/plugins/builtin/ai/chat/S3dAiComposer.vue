<template>
  <!-- a message changes the last result (its groups are replaced) – or, switched off, builds something new -->
  <div
    v-if="target && !isMesh"
    class="flex items-center gap-1.5 border-t border-line px-3 pt-1.5 text-[0.6875rem]"
    :class="changeLast ? 'text-navy' : 'text-ink-2'"
  >
    <label class="flex min-w-0 cursor-pointer items-center gap-1.5" :title="t('ai.chat.changeTitle')">
      <input v-model="changeLast" type="checkbox" />
      <span class="truncate">{{ t('ai.chat.changeLast', { names: targetNames }) }}</span>
    </label>
  </div>
  <div v-if="pictures.length" class="flex flex-wrap gap-1.5 border-t border-line px-3 pt-2">
    <div v-for="(picture, index) in pictures" :key="index" class="relative">
      <img :src="picture" alt="" class="h-14 max-w-24 border border-line-2 object-cover" />
      <button
        type="button"
        class="absolute -top-1.5 -end-1.5 flex size-4.5 items-center justify-center rounded-full bg-ink text-[0.625rem] text-surface"
        :title="t('ai.chat.removePicture')"
        :aria-label="t('ai.chat.removePicture')"
        @click="pictures.splice(index, 1)"
      >
        ✕
      </button>
    </div>
    <span class="self-end text-[0.625rem] text-muted">{{ t('ai.chat.visionHint') }}</span>
  </div>
  <div
    class="flex gap-1.5 border-t border-line px-3 pt-2 pb-1"
    :class="{ 'outline-2 -outline-offset-2 outline-navy outline-dashed': dragging }"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="drop"
  >
    <div v-if="!isMesh" class="flex flex-col gap-1">
      <button
        type="button"
        class="flex size-7 items-center justify-center border border-line-2 bg-surface text-navy hover:bg-hover disabled:opacity-40"
        :title="t('ai.chat.attachPicture')"
        :aria-label="t('ai.chat.attachPicture')"
        :disabled="!aiConfig.configured"
        @click="fileInput?.click()"
      >
        <S3dIcon name="file" :size="15" />
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center border border-line-2 bg-surface text-navy hover:bg-hover disabled:opacity-40"
        :title="t('ai.chat.attachView')"
        :aria-label="t('ai.chat.attachView')"
        :disabled="!aiConfig.configured"
        @click="attachView"
      >
        <S3dIcon name="camera" :size="15" />
      </button>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="pick" />
    </div>
    <textarea
      v-model="prompt"
      class="flex-1 resize-none border border-line-2 bg-surface px-2 py-1.5 font-sans text-[0.8125rem] outline-none focus:border-navy"
      rows="2"
      :disabled="!aiConfig.configured"
      :placeholder="isMesh ? t('ai.chat.placeholderMesh') : t('ai.chat.placeholder')"
      :aria-label="t('ai.chat.send')"
      @keydown.stop
      @keydown.enter.exact.prevent="submit"
      @paste="paste"
    ></textarea>
    <button
      v-if="aiState.busy"
      type="button"
      class="flex w-9.5 items-center justify-center bg-[#c62828] text-white"
      :title="t('scenes.stop')"
      :aria-label="t('scenes.stop')"
      @click="stop"
    >
      <S3dIcon name="stop" :size="16" />
    </button>
    <button
      v-else
      type="button"
      class="flex w-9.5 items-center justify-center bg-navy-bg text-white disabled:cursor-default disabled:opacity-40"
      :title="t('ai.chat.send')"
      :aria-label="t('ai.chat.send')"
      :disabled="!prompt.trim() || !aiConfig.configured"
      @click="submit"
    >
      <S3dIcon name="send" :size="16" />
    </button>
  </div>
  <div
    class="flex items-center gap-3.5 px-3 pt-0.5 pb-2 text-[0.6875rem] text-ink-2 [&_label]:flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:gap-1.5"
  >
    <label><input v-model="aiConfig.autoRun" type="checkbox" /> {{ t('ai.chat.autoRun') }}</label>
    <label v-if="!isMesh" :class="{ 'font-bold text-warn': aiConfig.fast }" :title="t('ai.chat.fastTitle')"
      ><input v-model="aiConfig.fast" type="checkbox" /> {{ t('ai.chat.fast') }}</label
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import S3dIcon from '../../../../components/S3dIcon.vue';
import { useEditor } from '../../../../components/keys';
import { aiConfig, modeFor } from '../providers';
import { aiState, send, stop, changeTarget, builtNames } from '../agent';
import { usePictureAttachments } from '../usePictureAttachments';
import { t } from '../../../../i18n';

/**
 * Writing a message: what it changes, attached pictures, the text, send/stop, auto-run and fast mode.
 * Emits `sent` right before a message goes out; `ask(question)` sends a quick question from outside.
 */
const emit = defineEmits<{ (event: 'sent'): void }>();
const editor = useEditor();
const { pictures, dragging, pick, paste, drop, attachView } = usePictureAttachments();
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const prompt = ref('');
const isMesh = computed(() => modeFor(aiConfig.model) === 'mesh');

// what the next message changes: the last result still in the model (on by default – off builds something new)
const changeLast = ref(true);
const target = computed(() => {
  void editor.ui.revision;
  void aiState.turns.length;
  return aiState.busy ? null : changeTarget(editor);
});
const targetNames = computed(() => (target.value ? builtNames(editor, target.value).join(', ') : ''));

const submit = () => {
  const text = prompt.value;
  if (!text.trim() || aiState.busy) {
    return;
  }
  const images = pictures.value;
  const change = !!target.value && changeLast.value;
  prompt.value = '';
  pictures.value = [];
  changeLast.value = true;
  emit('sent');
  send(editor, text, { images, change });
};
const ask = (question: string) => {
  prompt.value = question;
  submit();
};
// the quick questions of the empty chat live in the message list
defineExpose({ ask });
</script>
