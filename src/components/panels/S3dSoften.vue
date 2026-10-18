<template>
  <p class="s3d-label my-3">Mildert Kanten zwischen Flächen der Auswahl ab, deren Winkel kleiner als der eingestellte Wert ist.</p>
  <div class="s3d-row"><span class="s3d-label">Winkel</span><input type="range" min="0" max="180" step="1" v-model.number="angle" class="flex-1" /><span class="w-10.5 text-right">{{ angle }}°</span></div>
  <label class="s3d-check"><input type="checkbox" v-model="coplanar" /> Koplanare abmildern</label>
  <div class="mt-2 flex gap-1.5"><button class="s3d-btn small" :disabled="!editor.selection.size" @click="apply">Auf Auswahl anwenden</button><button class="s3d-btn small" :disabled="!editor.selection.size" @click="clear">Zurücksetzen</button></div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useEditor } from '../keys';

const editor = useEditor();
const angle = ref(20);
const coplanar = ref(true);

/** Edge ids of the selection – edges inside selected groups/components get a negative id. */
const selectedEdgeIds = (): number[] => {
  void editor.ui.selRev;
  const entities = editor.entities;
  const selection = editor.selected();
  const ids = new Set<number>();
  for (const item of selection) {
    if (item.kind === 'edge') ids.add(item.id);
    if (item.kind === 'face') {
      const face = entities.faces.get(item.id);
      if (face) entities.faceEdges(face).forEach(edge => ids.add(edge.id));
    }
  }
  if (selection.some(item => item.kind === 'instance')) {
    for (const item of selection) {
      const instance = entities.instances.get(item.id);
      if (instance) instance.definition.entities.edges.forEach(edge => ids.add(-edge.id));
    }
  }
  return [...ids];
};

const apply = () => {
  const minCosine = Math.cos(angle.value * Math.PI / 180);
  editor.commit('Abmildern/Glätten', () => {
    const entities = editor.entities;
    const soften = (container: typeof entities, ids: number[]) => {
      for (const id of ids) {
        const edge = container.edges.get(id);
        if (!edge) continue;
        const faces = container.facesOfEdge(id);
        if (faces.length !== 2) continue;
        const cosine = container.faceNormal(faces[0]).dot(container.faceNormal(faces[1]));
        edge.soft = (cosine >= minCosine && (coplanar.value || cosine < 1 - 1e-6)) || undefined;
      }
    };
    soften(entities, selectedEdgeIds().filter(id => id > 0));
    for (const item of editor.selected()) {
      if (item.kind !== 'instance') continue;
      const instance = entities.instances.get(item.id);
      if (instance) soften(instance.definition.entities, [...instance.definition.entities.edges.keys()]);
    }
  });
};

const clear = () => {
  editor.commit('Abmildern zurücksetzen', () => {
    const entities = editor.entities;
    for (const id of selectedEdgeIds()) {
      const edge = id > 0 ? entities.edges.get(id) : undefined;
      if (edge) edge.soft = undefined;
    }
    for (const item of editor.selected()) {
      if (item.kind !== 'instance') continue;
      const instance = entities.instances.get(item.id);
      if (instance) instance.definition.entities.edges.forEach(edge => (edge.soft = undefined));
    }
  });
};
</script>
