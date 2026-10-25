<template>
  <div class="mb-2 flex gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <button class="s3d-btn small" @click="add"><S3dIcon name="plus" :size="14" /> {{ t('tags.add') }}</button>
    <button class="s3d-btn small" :disabled="!editor.selection.size" :title="t('tags.assignTitle')" @click="assign">
      {{ t('tags.assign') }}
    </button>
    <button class="s3d-btn small" :disabled="!scenes.length" :title="t('tags.toScenesTitle')" @click="openToScenes">
      {{ t('tags.toScenes') }}
    </button>
  </div>
  <!-- the highlighted tag's visibility into the chosen scenes (SketchUp 2025 "Apply Tags to Scenes") -->
  <div v-if="toScenes" class="mb-2 rounded-[3px] border border-line p-2 text-xs">
    <p class="mt-0 mb-1.5">
      {{ t(activeTag?.visible === false ? 'tags.toScenesHidden' : 'tags.toScenesVisible', { tag: activeLabel }) }}
    </p>
    <label v-for="scene in scenes" :key="scene.id" class="s3d-check">
      <input v-model="chosenScenes" type="checkbox" :value="scene.id" /> {{ scene.name }}
    </label>
    <div class="mt-2 flex gap-1.5">
      <button class="s3d-btn small" :disabled="!chosenScenes.length" @click="applyToScenes">{{ t('tags.apply') }}</button>
      <button class="s3d-btn small" @click="toScenes = false">{{ t('common.cancel') }}</button>
    </div>
  </div>
  <div class="rounded-[3px] border border-line">
    <div
      v-for="tag in tags"
      :key="tag.name"
      class="flex cursor-pointer items-center gap-1.5 border-b border-line px-1.5 py-1 last:border-b-0"
      :class="{ 'bg-active': active === tag.name }"
      @click="active = tag.name"
    >
      <button class="flex bg-transparent p-0.5 text-[#4a535b] dark:text-ink-2" @click.stop="toggle(tag)">
        <S3dIcon :name="tag.visible ? 'eye' : 'eyeOff'" :size="16" />
      </button>
      <input
        v-if="editing === tag.name"
        class="s3d-input"
        :value="tag.name"
        @change="rename(tag, ($event.target as HTMLInputElement).value)"
        @blur="editing = null"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <span v-else class="flex-1 truncate" @dblclick="tag.name !== 'Untagged' && (editing = tag.name)">{{
        tag.name === 'Untagged' ? t('tags.untagged') : tag.name
      }}</span>
      <input
        class="h-4.5 w-5.5 rounded-[2px] border border-line-2 p-0"
        type="color"
        :value="tag.color"
        @click.stop
        @change="setColor(tag, ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="tag.name !== 'Untagged'"
        class="flex bg-transparent p-0.5 text-[#4a535b] dark:text-ink-2"
        :title="t('commands.delete')"
        @click.stop="remove(tag)"
      >
        <S3dIcon name="trash" :size="15" />
      </button>
    </div>
  </div>
  <p class="s3d-label my-3">{{ t('tags.hint') }}</p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import type { Tag } from '../../core/document';
import type { Entities } from '../../core/model';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();
const active = ref('Untagged');
const editing = ref<string | null>(null);
const tags = useModel(() => editor.model.tags);
const scenes = useModel(() => [...editor.model.scenes]);

const activeTag = computed(() => tags.value.find((tag) => tag.name === active.value));
const activeLabel = computed(() => (active.value === 'Untagged' ? t('tags.untagged') : active.value));
const toScenes = ref(false);
const chosenScenes = ref<number[]>([]);
const openToScenes = () => {
  chosenScenes.value = scenes.value.map((scene) => scene.id);
  toScenes.value = !toScenes.value;
};
/** writes the highlighted tag's current visibility into the chosen scenes */
const applyToScenes = () => {
  const tag = activeTag.value;
  if (!tag) {
    return;
  }
  editor.commit('undo.tagsToScenes', () => {
    for (const scene of editor.model.scenes.filter((candidate) => chosenScenes.value.includes(candidate.id))) {
      const hidden = (scene.hiddenTags ?? []).filter((name) => name !== tag.name);
      scene.hiddenTags = tag.visible ? hidden : [...hidden, tag.name];
    }
  });
  toScenes.value = false;
  editor.toast(t('tags.appliedToScenes', { tag: activeLabel.value, count: chosenScenes.value.length }));
};

const randomColor = () =>
  '#' +
  Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
const nameTaken = (name: string) => editor.model.tags.some((tag) => tag.name === name);

const add = () => {
  let name = 'Tag';
  let counter = 1;
  while (nameTaken(name)) {
    name = `Tag ${++counter}`;
  }
  editor.commit('tags.add', () => editor.model.tags.push({ name, visible: true, color: randomColor() }));
  editing.value = name;
  active.value = name;
};
const toggle = (tag: Tag) => {
  editor.commit('undo.tagVisibility', () => {
    tag.visible = !tag.visible;
  });
};
const setColor = (tag: Tag, color: string) => {
  tag.color = color;
  editor.ui.saved = false;
  editor.ui.revision++;
};

/** Calls `visit` for every face, edge and instance of the model (each definition only once). */
const walkAll = (visit: (item: { tag?: string }) => void) => {
  const seen = new Set<Entities>();
  const walk = (entities: Entities) => {
    if (seen.has(entities)) {
      return;
    }
    seen.add(entities);
    entities.faces.forEach((face) => visit(face));
    entities.edges.forEach((edge) => visit(edge));
    entities.instances.forEach((instance) => {
      visit(instance);
      walk(instance.definition.entities);
    });
  };
  walk(editor.model.root);
};

const rename = (tag: Tag, newName: string) => {
  const name = newName.trim();
  editing.value = null;
  if (!name || nameTaken(name)) {
    return;
  }
  const oldName = tag.name;
  editor.commit('undo.renameTag', () => {
    tag.name = name;
    walkAll((item) => {
      if (item.tag === oldName) {
        item.tag = name;
      }
    });
    // scenes remember hidden tags by name
    for (const scene of editor.model.scenes) {
      scene.hiddenTags = scene.hiddenTags?.map((hidden) => (hidden === oldName ? name : hidden));
    }
  });
};
const remove = (tag: Tag) => {
  editor.commit('undo.deleteTag', () => {
    editor.model.tags = editor.model.tags.filter((other) => other !== tag);
    walkAll((item) => {
      if (item.tag === tag.name) {
        item.tag = undefined;
      }
    });
    for (const scene of editor.model.scenes) {
      scene.hiddenTags = scene.hiddenTags?.filter((hidden) => hidden !== tag.name);
    }
  });
};
/** Puts the selected faces, edges and objects on the highlighted tag. */
const assign = () => {
  const tagName = active.value === 'Untagged' ? undefined : active.value;
  editor.commit('undo.assignTag', () => {
    const entities = editor.entities;
    for (const item of editor.selected()) {
      const target: { tag?: string } | undefined =
        item.kind === 'face'
          ? entities.faces.get(item.id)
          : item.kind === 'edge'
            ? entities.edges.get(item.id)
            : entities.instances.get(item.id);
      if (target) {
        target.tag = tagName;
      }
    }
  });
};
</script>
