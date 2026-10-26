<template>
  <div class="s3d-lo-title s3d-lo-layers-title">
    {{ t('layout.layers.title') }}
    <button class="s3d-lo-icon-button" :title="t('layout.layers.add')" @click="add">+</button>
  </div>
  <div class="s3d-lo-layers">
    <!-- top layer first, as it lies on the sheet -->
    <div
      v-for="layer in [...layers].reverse()"
      :key="layer.id"
      class="s3d-lo-layer"
      :class="{ active: layer.id === active }"
      :title="t('layout.layers.activeTitle')"
      @click="emit('activate', layer.id)"
      @dblclick="rename(layer)"
    >
      <button
        class="s3d-lo-icon-button"
        :class="{ off: !layer.visible }"
        :title="t(layer.visible ? 'layout.layers.hide' : 'layout.layers.show')"
        @click.stop="change(layer.id, { visible: !layer.visible })"
      >
        {{ layer.visible ? '◉' : '○' }}
      </button>
      <button
        class="s3d-lo-icon-button"
        :class="{ off: !layer.locked }"
        :title="t(layer.locked ? 'layout.layers.unlock' : 'layout.layers.lock')"
        @click.stop="change(layer.id, { locked: !layer.locked })"
      >
        {{ layer.locked ? '🔒' : '🔓' }}
      </button>
      <span class="s3d-lo-layer-name">{{ layerName(layer) }}</span>
      <button
        class="s3d-lo-icon-button s3d-lo-layer-extra"
        :disabled="isTop(layer)"
        :title="t('layout.layers.up')"
        @click.stop="move(layer.id, 1)"
      >
        ▴
      </button>
      <button
        class="s3d-lo-icon-button s3d-lo-layer-extra"
        :disabled="isBottom(layer)"
        :title="t('layout.layers.down')"
        @click.stop="move(layer.id, -1)"
      >
        ▾
      </button>
      <button
        class="s3d-lo-icon-button s3d-lo-layer-extra"
        :disabled="layers.length < 2"
        :title="t('layout.layers.remove')"
        @click.stop="remove(layer)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { changeDocument, layersOf, newId, type LayoutDocument, type LayoutLayer } from './document';
import { pluginContext, t } from './runtime';

/**
 * The layers of the document (the same on every sheet): the active one gets new elements; hidden layers are
 * neither shown nor printed, locked ones cannot be picked. A double-click renames.
 */
const props = defineProps<{ document: LayoutDocument; active: string }>();
const emit = defineEmits<{ (event: 'activate', id: string): void }>();

const context = pluginContext();
const layers = computed(() => layersOf(props.document));
const layerName = (layer: LayoutLayer) => layer.name || t('layout.layers.default');
const isTop = (layer: LayoutLayer) => layers.value[layers.value.length - 1].id === layer.id;
const isBottom = (layer: LayoutLayer) => layers.value[0].id === layer.id;

/** edits the layers of the stored document (the implicit default layer becomes a real one first) */
const changeLayers = (change: (layers: LayoutLayer[]) => void) =>
  changeDocument((stored) => {
    stored.layers = layersOf(stored).map((layer) => ({ ...layer }));
    change(stored.layers);
  }, 'layout.undo.layers');

const change = (id: string, values: Partial<LayoutLayer>) =>
  changeLayers((list) =>
    Object.assign(
      list.find((layer) => layer.id === id)!,
      values,
    ),
  );

const add = async () => {
  const name = await context.ui.prompt(t('layout.layers.name'), t('layout.layers.newName', { number: layers.value.length + 1 }));
  if (name) {
    const id = newId();
    changeLayers((list) => list.push({ id, name, visible: true, locked: false }));
    emit('activate', id);
  }
};
const rename = async (layer: LayoutLayer) => {
  const name = await context.ui.prompt(t('layout.layers.name'), layerName(layer));
  if (name) {
    change(layer.id, { name });
  }
};
const move = (id: string, step: number) =>
  changeLayers((list) => {
    const index = list.findIndex((layer) => layer.id === id);
    const [layer] = list.splice(index, 1);
    list.splice(Math.max(0, Math.min(list.length, index + step)), 0, layer);
  });
/** the elements of a removed layer go to the bottom layer that is left */
const remove = async (layer: LayoutLayer) => {
  if (!(await context.ui.confirm(t('layout.layers.removeConfirm', { name: layerName(layer) })))) {
    return;
  }
  changeDocument((stored) => {
    const list = layersOf(stored).filter((candidate) => candidate.id !== layer.id);
    const fallback = list[0].id;
    for (const page of stored.pages) {
      for (const element of page.elements) {
        if ((element.layer ?? layersOf(stored)[0].id) === layer.id) {
          element.layer = fallback;
        }
      }
    }
    stored.layers = list;
  }, 'layout.undo.layers');
  if (props.active === layer.id) {
    emit('activate', layers.value[0].id);
  }
};
</script>
