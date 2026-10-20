<template>
  <div class="text-[0.78125rem]">
    <label class="flex items-center justify-between">
      <span class="text-[0.8125rem] font-bold">{{ t('palette.meshView') }}</span>
      <S3dToggleSwitch v-model="meshView.on" :label="t('palette.meshView')" @update:model-value="redraw()" />
    </label>
    <div class="mt-1.5 mb-0.5 ms-0.5" :class="{ 'opacity-50': !meshView.on }">
      <label class="s3d-check"
        ><input v-model="meshView.points" type="checkbox" :disabled="!meshView.on" @change="redraw()" />
        <i class="inline-block h-2.5 w-3.5 bg-[radial-gradient(circle,#0e8ca0_3px,transparent_3.5px)]"></i> {{ t('mesh.vertices') }}</label
      >
      <label class="s3d-check"
        ><input v-model="meshView.triangles" type="checkbox" :disabled="!meshView.on" @change="redraw()" />
        <i class="inline-block h-2.5 w-3.5 -skew-y-[25deg] border-b-[1.5px] border-brand-deep opacity-60"></i>
        {{ t('mesh.faceTriangles') }}</label
      >
      <label class="s3d-check"
        ><input v-model="meshView.soft" type="checkbox" :disabled="!meshView.on" @change="redraw()" />
        <i class="inline-block h-2.5 w-3.5 border-b-[1.5px] border-dashed border-ink-2"></i> {{ t('mesh.softEdges') }}</label
      >
    </div>

    <div class="mt-3.5 mb-1.5 s3d-caption text-navy">{{ scope }}</div>
    <div
      class="grid grid-cols-[repeat(2,1fr)] gap-1.5 [&>div]:flex [&>div]:flex-col [&>div]:border [&>div]:border-line [&>div]:bg-surface-2 [&>div]:px-2 [&>div]:py-1.5 [&_b]:text-base [&_b]:tabular-nums [&_span]:text-[0.6875rem] [&_span]:text-muted"
    >
      <div>
        <b>{{ fmt(stats.vertices) }}</b
        ><span>{{ t('mesh.vertices') }}</span>
      </div>
      <div>
        <b>{{ fmt(stats.edges) }}</b
        ><span
          >{{ t('modelInfo.edges')
          }}<template v-if="stats.softEdges"> {{ t('mesh.softCount', { count: fmt(stats.softEdges) }) }}</template></span
        >
      </div>
      <div>
        <b>{{ fmt(stats.faces) }}</b
        ><span>{{ t('modelInfo.faces') }}</span>
      </div>
      <div>
        <b>{{ fmt(stats.triangles) }}</b
        ><span>{{ t('mesh.triangles') }}</span>
      </div>
    </div>

    <!-- exact resolution: parametric shape or flat circle -->
    <template v-if="res">
      <div class="mt-3.5 mb-1.5 s3d-caption text-navy">{{ t('mesh.resolution', { shape: res.label }) }}</div>
      <div class="flex items-center gap-1.5">
        <button class="s3d-btn small" :title="t('mesh.less')" @click="applyRes(res.value - step(res.value))">−</button>
        <input
          v-model.number="draft"
          class="s3d-input w-17.5 text-center"
          type="number"
          :min="res.min"
          max="256"
          @change="applyRes(draft)"
          @keydown.enter="applyRes(draft)"
        />
        <span class="flex-1 text-ink-2">{{ res.unit }}</span>
        <button class="s3d-btn small" :title="t('mesh.more')" @click="applyRes(res.value + step(res.value))">+</button>
      </div>
      <input v-model.number="draft" class="mt-2 mb-1 w-full" type="range" :min="res.min" max="96" step="1" @change="applyRes(draft)" />
      <div class="flex flex-wrap gap-1">
        <button
          v-for="preset in res.presets"
          :key="preset"
          class="s3d-chip tabular-nums"
          :class="{ on: res.value === preset }"
          @click="applyRes(preset)"
        >
          {{ preset }}
        </button>
      </div>
      <p class="mt-2 mb-0 text-[0.71875rem]/[1.45] text-ink-2">{{ res.hint }}</p>
    </template>

    <!-- any group / component -->
    <template v-if="inst">
      <div class="mt-3.5 mb-1.5 s3d-caption text-navy">{{ t('mesh.change') }}</div>
      <div class="grid grid-cols-[repeat(2,1fr)] gap-1.5 [&_.s3d-btn]:px-1.5">
        <button class="s3d-btn" :title="t('mesh.moreKeepTitle')" @click="more(false)">{{ t('mesh.moreKeep') }}</button>
        <button class="s3d-btn" :title="t('mesh.moreRoundTitle')" @click="more(true)">{{ t('mesh.moreRound') }}</button>
      </div>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button class="s3d-btn" @click="less()">{{ t('mesh.lessButton') }}</button>
        <label class="flex flex-[1_1_100%] items-center gap-1.5 text-ink-2"
          >{{ t('mesh.to') }} <input class="min-w-0 flex-1" v-model.number="keep" type="range" min="10" max="90" step="5" />
          <b>{{ keep }} %</b></label
        >
      </div>
      <p class="mt-2 mb-0 text-[0.71875rem]/[1.45] text-ink-2">
        {{ t(inst.definition.isComponent ? 'mesh.affectsComponent' : 'mesh.affectsGroup') }}
      </p>
    </template>

    <p v-if="!res && !inst" class="mt-2 mb-0 text-[0.71875rem]/[1.45] text-ink-2">{{ t('mesh.selectHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import S3dToggleSwitch from '../ui/S3dToggleSwitch.vue';
import { computed, ref, watch } from 'vue';
import { useEditor } from '../keys';
import { meshView } from '../../engine/meshView';
import { meshStats, sumStats, detectCircle, type MeshStats } from '../../core/meshops';
import { resolutionOf, setResolution, setCircleSegments, subdivideInstance, simplifyInstance } from '../../scripting/reshape';
import type { Instance, Face } from '../../core/model';
import { useModel, useSelection } from '../../composables/useModel';
import { t, formatNumber } from '../../i18n';

const editor = useEditor();
const keep = ref(50);
const redraw = () => editor.invalidate();
const fmt = (count: number) => formatNumber(count);

const sel = useSelection(() => editor.selected());
const inst = computed<Instance | null>(() => {
  const selection = sel.value;
  if (selection.length !== 1 || selection[0].kind !== 'instance') {
    return null;
  }
  return editor.entities.instances.get(selection[0].id) ?? null;
});
const face = computed<Face | null>(() => {
  const faces = sel.value.filter((entityRef) => entityRef.kind === 'face');
  if (faces.length !== 1 || sel.value.some((entityRef) => entityRef.kind === 'instance')) {
    return null;
  }
  return editor.entities.faces.get(faces[0].id) ?? null;
});

const scope = computed(() => (sel.value.length ? t('mesh.selection') : t('mesh.wholeModel')));
const stats = useModel<MeshStats>(() => {
  const selection = sel.value;
  if (!selection.length) {
    return meshStats(editor.model.root);
  }
  const parts: MeshStats[] = [];
  const faces = selection.filter((entityRef) => entityRef.kind === 'face'),
    edges = selection.filter((entityRef) => entityRef.kind === 'edge');
  for (const entityRef of selection.filter((candidate) => candidate.kind === 'instance')) {
    const instance = editor.entities.instances.get(entityRef.id);
    if (instance) {
      parts.push(meshStats(instance.definition.entities));
    }
  }
  if (faces.length || edges.length) {
    const verts = new Set<number>();
    let tris = 0;
    for (const entityRef of faces) {
      const faceEntity = editor.entities.faces.get(entityRef.id);
      if (!faceEntity) {
        continue;
      }
      [...faceEntity.outer, ...faceEntity.holes.flat()].forEach((vertex) => verts.add(vertex));
      tris += editor.entities.faceTriangles(faceEntity).length / 3;
    }
    for (const entityRef of edges) {
      const edge = editor.entities.edges.get(entityRef.id);
      if (edge) {
        verts.add(edge.start);
        verts.add(edge.end);
      }
    }
    parts.push({
      vertices: verts.size,
      edges: edges.length,
      faces: faces.length,
      triangles: tris,
      softEdges: edges.filter((entityRef) => editor.entities.edges.get(entityRef.id)?.soft).length,
    });
  }
  return sumStats(parts);
});

const res = useModel(() => {
  if (inst.value) {
    const resolution = resolutionOf(inst.value);
    if (!resolution) {
      return null;
    }
    return {
      ...resolution,
      unit: t(`vcb.${resolution.option}`),
      presets: resolution.option === 'sides' ? [3, 4, 5, 6, 8, 12] : [8, 12, 16, 24, 32, 48, 64],
      hint: t('mesh.exactHint'),
    };
  }
  if (face.value) {
    const circle = detectCircle(editor.entities, face.value);
    if (!circle) {
      return null;
    }
    return {
      value: circle.segments,
      min: 3,
      label: t('tools.circle'),
      unit: t('vcb.segments'),
      presets: [6, 8, 12, 16, 24, 32, 48, 64],
      hint: t('mesh.circleHint'),
    };
  }
  return null;
});
const draft = ref(24);
watch(
  res,
  (resolution) => {
    if (resolution) {
      draft.value = resolution.value;
    }
  },
  { immediate: true },
);
const step = (value: number) => (value < 12 ? 1 : value < 32 ? 4 : 8);

const applyRes = (value: number) => {
  if (!res.value || !Number.isFinite(value)) {
    return;
  }
  const segments = Math.max(res.value.min, Math.min(256, Math.round(value)));
  if (segments === res.value.value) {
    return;
  }
  if (inst.value) {
    setResolution(editor, inst.value, segments);
  } else if (face.value) {
    setCircleSegments(editor, editor.entities, face.value, segments);
  }
};
const more = (round: boolean) => {
  if (!inst.value) {
    return;
  }
  const err = subdivideInstance(editor, inst.value, round);
  editor.toast(err ?? t('mesh.moreDone'));
};
const less = async () => {
  if (!inst.value) {
    return;
  }
  const err = await simplifyInstance(editor, inst.value, keep.value / 100);
  editor.toast(err ?? t('mesh.lessDone'));
};
</script>
