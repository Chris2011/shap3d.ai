<template>
  <div v-if="info.kind === 'none'">
    <div class="mt-1 mb-2.5 font-semibold">{{ t('editor.noSelection') }}</div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('entityInfo.model') }}</span
      ><span>{{ editor.model.name }}</span>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('modelInfo.faces') }}</span
      ><span>{{ stats.faces }}</span>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('modelInfo.edges') }}</span
      ><span>{{ stats.edges }}</span>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('panels.components') }}</span
      ><span>{{ editor.model.definitions.size }}</span>
    </div>
  </div>
  <div v-else>
    <div class="mt-1 mb-2.5 font-semibold">{{ info.title }}</div>
    <!-- material -->
    <div v-if="info.kind !== 'edge'" class="s3d-row">
      <span class="s3d-label">{{ t('entityInfo.material') }}</span>
      <div
        class="size-6.5 flex-none rounded-[3px] border border-line-2"
        :style="{ background: info.matColor }"
        :title="info.material ?? t('names.defaultMaterial')"
      ></div>
      <span class="flex-1 truncate text-xs">{{ info.material ?? t('names.defaultMaterial') }}</span>
      <button
        class="s3d-btn small"
        :title="t('entityInfo.assignTitle')"
        @click="assign('material', editor.ui.currentMaterial ?? undefined)"
      >
        {{ t('tags.assign') }}
      </button>
    </div>
    <div v-if="info.kind === 'face'" class="s3d-row">
      <span class="s3d-label">{{ t('styles.back') }}</span>
      <div class="size-6.5 flex-none rounded-[3px] border border-line-2" :style="{ background: info.backColor }"></div>
      <span class="flex-1 truncate text-xs">{{ info.back ?? t('names.defaultMaterial') }}</span>
      <button class="s3d-btn small" @click="assign('backMaterial', editor.ui.currentMaterial ?? undefined)">{{ t('tags.assign') }}</button>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('entityInfo.tag') }}</span>
      <select class="s3d-input" :value="info.tag ?? 'Untagged'" @change="setTag(($event.target as HTMLSelectElement).value)">
        <option v-for="tag in editor.model.tags" :key="tag.name" :value="tag.name">
          {{ tag.name === 'Untagged' ? t('tags.untagged') : tag.name }}
        </option>
      </select>
    </div>
    <template v-if="info.kind === 'instance'">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('entityInfo.instance') }}</span
        ><input class="s3d-input" :value="info.name" @change="setName(($event.target as HTMLInputElement).value)" />
      </div>
      <div class="s3d-row">
        <span class="s3d-label">{{ t('entityInfo.definition') }}</span
        ><input class="s3d-input" :value="info.defName" @change="setDefName(($event.target as HTMLInputElement).value)" />
      </div>
      <div class="s3d-row">
        <span class="s3d-label">{{ t('entityInfo.type') }}</span
        ><span>{{ info.isComponent ? t('entityInfo.componentCopies', { count: info.count }) : t('names.group') }}</span>
      </div>
      <div class="s3d-row">
        <span class="s3d-label">{{ t('entityInfo.position') }}</span>
        <input
          v-for="(coord, i) in info.pos"
          :key="i"
          class="s3d-input w-1/3 px-1 text-xs"
          :value="fmtNum(Number(coord))"
          @change="setPos(Number(i), ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="s3d-row">
        <span class="s3d-label">{{ t('materials.size') }}</span
        ><span>{{ info.size }}</span>
      </div>
      <div class="s3d-row" v-if="info.volume">
        <span class="s3d-label">{{ t('entityInfo.volume') }}</span
        ><span>{{ info.volume }}</span>
      </div>
      <label class="s3d-check"><input type="checkbox" :checked="info.locked" @change="toggle('locked')" /> {{ t('toast.locked') }}</label>
    </template>
    <template v-if="info.kind === 'face'">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('entityInfo.face') }}</span
        ><span>{{ info.area }}</span>
      </div>
    </template>
    <template v-if="info.kind === 'edge'">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('vcb.length') }}</span
        ><span>{{ info.length }}</span>
      </div>
      <label class="s3d-check"
        ><input type="checkbox" :checked="info.soft" @change="toggle('soft')" /> {{ t('entityInfo.softened') }}</label
      >
    </template>
    <template v-if="info.kind === 'multi'">
      <div class="s3d-row" v-if="info.area">
        <span class="s3d-label">{{ t('entityInfo.totalArea') }}</span
        ><span>{{ info.area }}</span>
      </div>
      <div class="s3d-row" v-if="info.length">
        <span class="s3d-label">{{ t('entityInfo.totalLength') }}</span
        ><span>{{ info.length }}</span>
      </div>
    </template>
    <label class="s3d-check"
      ><input type="checkbox" :checked="info.hidden" @change="toggle('hidden')" /> {{ t('entityInfo.hidden') }}</label
    >
  </div>
</template>

<script setup lang="ts">
import * as THREE from 'three';
import { useEditor } from '../keys';
import type { EntityRef } from '../../core/model';
import { parseLength, formatVolume } from '../../core/units';
import { isSolid, volume } from '../../core/solids';
import { useModel, useSelection } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();
const stats = useModel(() => editor.model.root.stats());
const col = (materialName?: string, fallback = '#ffffff') => editor.model.material(materialName)?.color ?? fallback;
const fmtNum = (value: number) => editor.fmt(value);
const fmtVol = (cubicMeters: number) => formatVolume(cubicMeters, editor.model.settings.units);

const info = useSelection<any>(() => {
  const selection = editor.selected();
  const entities = editor.entities;
  const style = editor.model.settings.style;
  if (!selection.length) {
    return { kind: 'none' };
  }
  if (selection.length === 1) {
    const single = selection[0];
    if (single.kind === 'face') {
      const face = entities.faces.get(single.id)!;
      return {
        kind: 'face',
        title: t('entityInfo.face'),
        material: face.material,
        matColor: col(face.material, style.frontColor),
        back: face.backMaterial,
        backColor: col(face.backMaterial, style.backColor),
        tag: face.tag,
        hidden: !!face.hidden,
        area: editor.fmtArea(entities.faceArea(face)),
      };
    }
    if (single.kind === 'edge') {
      const edge = entities.edges.get(single.id)!;
      return {
        kind: 'edge',
        title: t('entityInfo.edge'),
        tag: edge.tag,
        hidden: !!edge.hidden,
        soft: !!edge.soft,
        length: editor.fmt(entities.edgeLength(edge)),
      };
    }
    const instance = entities.instances.get(single.id)!;
    const pos = new THREE.Vector3().setFromMatrixPosition(instance.matrix);
    const bounds = instance.definition.entities.bounds(new THREE.Box3(), instance.matrix.clone());
    const size = bounds.getSize(new THREE.Vector3());
    let count = 0;
    const walk = (container: typeof entities) => {
      for (const child of container.instances.values()) {
        if (child.definition === instance.definition) {
          count++;
        }
        walk(child.definition.entities);
      }
    };
    walk(editor.model.root);
    const solid = isSolid(instance.definition.entities);
    const vol = solid ? Math.abs(volume(instance.definition.entities, instance.matrix)) : 0;
    return {
      volume: solid ? fmtVol(vol) : '',
      kind: 'instance',
      title: t(
        solid
          ? instance.definition.isComponent
            ? 'entityInfo.solidComponent'
            : 'entityInfo.solidGroup'
          : instance.definition.isComponent
            ? 'names.component'
            : 'names.group',
      ),
      name: instance.name,
      defName: instance.definition.name,
      isComponent: instance.definition.isComponent,
      count,
      material: instance.material,
      matColor: col(instance.material, '#ffffff'),
      tag: instance.tag,
      hidden: !!instance.hidden,
      locked: !!instance.locked,
      pos: [pos.x, pos.y, pos.z],
      size: `${editor.fmt(size.x)} × ${editor.fmt(size.y)} × ${editor.fmt(size.z)}`,
    };
  }
  let area = 0,
    len = 0;
  const counts = { face: 0, edge: 0, instance: 0 };
  for (const entityRef of selection) {
    counts[entityRef.kind]++;
    if (entityRef.kind === 'face') {
      area += entities.faceArea(entities.faces.get(entityRef.id)!);
    }
    if (entityRef.kind === 'edge') {
      len += entities.edgeLength(entities.edges.get(entityRef.id)!);
    }
  }
  const first = selection.find((entityRef) => entityRef.kind === 'face');
  const firstMaterial = first ? entities.faces.get(first.id)!.material : undefined;
  return {
    kind: 'multi',
    title: t('entityInfo.elements', { count: selection.length, summary: editor.selectionSummary() }),
    material: firstMaterial,
    matColor: col(firstMaterial, style.frontColor),
    hidden: false,
    area: area ? editor.fmtArea(area) : '',
    length: len ? editor.fmt(len) : '',
  };
});

const each = (apply: (entityRef: EntityRef, entities: typeof editor.entities) => void, label: string) => {
  editor.commit(label, () => {
    for (const entityRef of editor.selected()) {
      apply(entityRef, editor.entities);
    }
  });
};
const assign = (prop: 'material' | 'backMaterial', material?: string) => {
  each((entityRef, entities) => {
    if (entityRef.kind === 'face') {
      const face = entities.faces.get(entityRef.id);
      if (face) {
        (face as any)[prop] = material;
      }
    }
    if (entityRef.kind === 'instance' && prop === 'material') {
      const instance = entities.instances.get(entityRef.id);
      if (instance) {
        instance.material = material;
      }
    }
  }, 'undo.paint');
};
const setTag = (tag: string) => {
  const value = tag === 'Untagged' ? undefined : tag;
  each((entityRef, entities) => {
    const target: any =
      entityRef.kind === 'face'
        ? entities.faces.get(entityRef.id)
        : entityRef.kind === 'edge'
          ? entities.edges.get(entityRef.id)
          : entities.instances.get(entityRef.id);
    if (target) {
      target.tag = value;
    }
  }, 'undo.tag');
};
const toggle = (prop: 'hidden' | 'soft' | 'locked') => {
  const val = !info.value[prop];
  each(
    (entityRef, entities) => {
      if ((prop === 'soft' && entityRef.kind !== 'edge') || (prop === 'locked' && entityRef.kind !== 'instance')) {
        return;
      }
      const target: any =
        entityRef.kind === 'face'
          ? entities.faces.get(entityRef.id)
          : entityRef.kind === 'edge'
            ? entities.edges.get(entityRef.id)
            : entities.instances.get(entityRef.id);
      if (target) {
        target[prop] = entityRef.kind === 'instance' ? val : val || undefined;
      }
    },
    prop === 'hidden' ? 'commands.hide' : prop === 'soft' ? 'commands.soften' : 'commands.lock',
  );
};
const setName = (name: string) => {
  each((entityRef, entities) => {
    const instance = entities.instances.get(entityRef.id);
    if (instance) {
      instance.name = name;
    }
  }, 'undo.rename');
};
const setDefName = (name: string) => {
  each((entityRef, entities) => {
    const instance = entities.instances.get(entityRef.id);
    if (instance && name.trim()) {
      instance.definition.name = name.trim();
    }
  }, 'undo.renameDefinition');
};
const setPos = (axis: number, text: string) => {
  const length = parseLength(text, editor.model.settings.units);
  if (length == null) {
    return;
  }
  each((entityRef, entities) => {
    const instance = entities.instances.get(entityRef.id);
    if (!instance) {
      return;
    }
    const elements = instance.matrix.elements;
    elements[12 + axis] = length;
  }, 'entityInfo.position');
};
</script>
