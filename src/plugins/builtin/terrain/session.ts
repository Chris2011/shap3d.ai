import * as THREE from 'three';
import { reactive } from 'vue';
import type { Editor } from '../../../engine/editor';
import type { Instance } from '../../../core/model';
import { shadeUniforms } from '../../../engine/viewer';
import { makeTexture, isTextureKind, TEXTURE_SIZE } from '../../../core/textures';
import { libraryMaterial } from '../../../core/materialLibrary';
import {
  type TerrainData,
  type Brush,
  type BrushMode,
  newTerrain,
  cellSize,
  idx,
  heightAt,
  applyBrush,
  generateHills,
  bakeTerrain,
  cloneTerrain,
  terrainOf,
  setTerrain,
  TERRAIN_PLUGIN,
} from './terrainData';
import { Entities } from '../../../core/model';
import { t } from '../../../i18n';

/** the sculpt tool, as registered by the plugin (plugin id + tool id) */
export const TERRAIN_TOOL = `${TERRAIN_PLUGIN}.sandbox`;

/**
 * A terrain sculpting session. While it runs the terrain is a plain three.js mesh in the viewer
 * (fast to deform); "Übernehmen" bakes it into a real group as one undo step.
 */
export const terrainUi = reactive({
  /** sculpting is running */
  active: false,
  /** "new terrain" chooser is open */
  chooser: false,
  brush: { mode: 'raise' as BrushMode, radius: 2, strength: 0.5 } as Brush,
  newW: 20,
  newD: 20,
  detail: 'mittel' as 'grob' | 'mittel' | 'fein',
  startHills: false,
  /** bumped whenever the grid or the settings change (panel re-reads info) */
  revision: 0,
  canUndo: false,
  title: '',
});

interface Session {
  editor: Editor;
  data: TerrainData;
  origin: THREE.Vector3; // world position of the grid corner (0, 0)
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  /** face the terrain was made from – removed on apply */
  srcFace: { ents: Entities; id: number } | null;
  /** existing terrain group being edited – hidden while sculpting */
  inst: Instance | null;
  undo: number[][];
}
let current: Session | null = null;
export const session = () => current;
export const terrainData = () => current?.data ?? null;

// ------------------------------------------------------------------ preview material
const LAYER_DEFAULT = { Gras: '#6fa347', Erde: '#8a6342', Fels: '#9a968e', Schnee: '#f3f6f9' };
const layerTex = (name: string, fallback: keyof typeof LAYER_DEFAULT) => {
  const material = current?.editor.model.materials.find((x) => x.name === name);
  const lib = libraryMaterial(name);
  const color = material?.color ?? lib?.color ?? LAYER_DEFAULT[fallback];
  const kind = material?.texture ?? lib?.texture;
  const size = material?.textureSize ?? lib?.size ?? (kind && isTextureKind(kind) ? TEXTURE_SIZE[kind] : 1);
  return { tex: kind && isTextureKind(kind) ? makeTexture(kind, color) : null, color: new THREE.Color(color), size };
};

const VERT = `
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec3 vW; varying float vH;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vH = position.z;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const FRAG = `
uniform vec3 lightDir; uniform float dark; uniform float light;
uniform sampler2D tG; uniform sampler2D tE; uniform sampler2D tR; uniform sampler2D tS;
uniform vec3 cG; uniform vec3 cE; uniform vec3 cR; uniform vec3 cS;
uniform vec4 useTex; uniform vec4 tile;
uniform float autoTex; uniform float rockH; uniform float snowH; uniform float earthSlope; uniform float rockSlope; uniform float dig;
varying vec3 vN; varying vec3 vW; varying float vH;
#include <clipping_planes_pars_fragment>
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 layer(sampler2D t, vec3 c, float use, float size){ return use > 0.5 ? texture2D(t, vW.xy / size).rgb : c; }
void main(){
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN);
  float slope = degrees(acos(clamp(abs(n.z), 0.0, 1.0)));
  vec3 col = layer(tG, cG, useTex.x, tile.x);
  if (autoTex > 0.5) {
    float e = max(smoothstep(earthSlope - 4.0, earthSlope + 4.0, slope), 1.0 - smoothstep(-dig - 0.12, -dig + 0.12, vH));
    float r = max(smoothstep(rockSlope - 4.0, rockSlope + 4.0, slope), smoothstep(rockH - 0.2, rockH + 0.2, vH));
    float s = snowH > -1e8 ? smoothstep(snowH - 0.2, snowH + 0.2, vH) * (1.0 - smoothstep(rockSlope + 5.0, rockSlope + 15.0, slope)) : 0.0;
    col = mix(col, layer(tE, cE, useTex.y, tile.y), e);
    col = mix(col, layer(tR, cR, useTex.z, tile.z), r);
    col = mix(col, layer(tS, cS, useTex.w, tile.w), s);
  }
  float f = clamp(dark + light * max(dot(n * (gl_FrontFacing ? 1.0 : -1.0), lightDir), 0.0), 0.0, 1.0);
  gl_FragColor = vec4(toSRGB(col) * f, 1.0);
}`;

const makeMaterial = () => {
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shadeUniforms,
      tG: { value: blank },
      tE: { value: blank },
      tR: { value: blank },
      tS: { value: blank },
      cG: { value: new THREE.Color() },
      cE: { value: new THREE.Color() },
      cR: { value: new THREE.Color() },
      cS: { value: new THREE.Color() },
      useTex: { value: new THREE.Vector4() },
      tile: { value: new THREE.Vector4(1, 1, 1, 1) },
      autoTex: { value: 1 },
      rockH: { value: 3 },
      snowH: { value: -1e9 },
      earthSlope: { value: 32 },
      rockSlope: { value: 50 },
      dig: { value: 0.3 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    clipping: true,
    // draws over the flat source face it was made from
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
};

/** Push texture + layer settings into the preview shader. */
export const refreshLook = () => {
  if (!current) {
    return;
  }
  const uniforms = (current.mesh.material as THREE.ShaderMaterial).uniforms;
  const layerData = current.data.layers;
  // i18n-ignore-next-line – fallback material names (model content)
  const layers = [
    layerTex(layerData.grass, 'Gras'),
    layerTex(layerData.earth, 'Erde'),
    layerTex(layerData.rock, 'Fels'),
    layerTex(layerData.snow, 'Schnee'),
  ];
  (['tG', 'tE', 'tR', 'tS'] as const).forEach((uniform, i) => {
    if (layers[i].tex) {
      uniforms[uniform].value = layers[i].tex;
    }
  });
  (['cG', 'cE', 'cR', 'cS'] as const).forEach((uniform, i) =>
    (uniforms[uniform].value as THREE.Color).copy(layers[i].color).convertSRGBToLinear(),
  );
  uniforms.useTex.value.set(...(layers.map((layer) => (layer.tex ? 1 : 0)) as [number, number, number, number]));
  uniforms.tile.value.set(...(layers.map((layer) => layer.size) as [number, number, number, number]));
  uniforms.autoTex.value = layerData.auto ? 1 : 0;
  uniforms.rockH.value = layerData.rockHeight;
  uniforms.snowH.value = layerData.snowHeight ?? -1e9;
  uniforms.earthSlope.value = layerData.earthSlope;
  uniforms.rockSlope.value = layerData.rockSlope;
  uniforms.dig.value = layerData.digDepth;
  const terrain = current.data;
  current.water.visible = terrain.water != null;
  if (terrain.water != null) {
    current.water.scale.set(terrain.width, terrain.depth, 1);
    current.water.position.set(
      current.origin.x + terrain.width / 2,
      current.origin.y + terrain.depth / 2,
      current.origin.z + terrain.water,
    );
  }
  terrainUi.revision++;
  current.editor.redraw();
};

const buildGeometry = (terrain: TerrainData) => {
  const { cx: cellX, cy: cellY } = cellSize(terrain);
  const pos = new Float32Array((terrain.columns + 1) * (terrain.rows + 1) * 3);
  for (let j = 0; j <= terrain.rows; j++) {
    for (let i = 0; i <= terrain.columns; i++) {
      const k = idx(terrain, i, j);
      pos[k * 3] = i * cellX;
      pos[k * 3 + 1] = j * cellY;
      pos[k * 3 + 2] = terrain.heights[k];
    }
  }
  const index: number[] = [];
  for (let j = 0; j < terrain.rows; j++) {
    for (let i = 0; i < terrain.columns; i++) {
      const indexA = idx(terrain, i, j),
        indexB = idx(terrain, i + 1, j),
        indexC = idx(terrain, i + 1, j + 1),
        indexD = idx(terrain, i, j + 1);
      if ((i + j) % 2 === 0) {
        index.push(indexA, indexB, indexC, indexA, indexC, indexD);
      } else {
        index.push(indexA, indexB, indexD, indexB, indexC, indexD);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};
/** Copy heights into the preview mesh after a brush dab. */
export const syncGeometry = () => {
  if (!current) {
    return;
  }
  const geometry = current.mesh.geometry;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let k = 0; k < current.data.heights.length; k++) {
    positions.setZ(k, current.data.heights[k]);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  terrainUi.revision++;
  current.editor.redraw();
};

// ------------------------------------------------------------------ lifecycle
const begin = (
  editor: Editor,
  data: TerrainData,
  origin: THREE.Vector3,
  extra: { srcFace?: Session['srcFace']; inst?: Instance | null; title: string },
) => {
  if (current) {
    end();
  }
  const mesh = new THREE.Mesh(buildGeometry(data), makeMaterial());
  mesh.position.copy(origin);
  mesh.renderOrder = 2;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x3f7fae, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  );
  water.renderOrder = 3;
  editor.viewer.helpers.add(mesh, water);
  current = { editor, data, origin: origin.clone(), mesh, water, srcFace: extra.srcFace ?? null, inst: extra.inst ?? null, undo: [] };
  if (current.inst) {
    current.inst.hidden = true;
    editor.invalidate();
  }
  const longest = Math.max(data.width, data.depth);
  terrainUi.brush.radius = +Math.max(0.5, longest / 8).toFixed(1);
  Object.assign(terrainUi, { active: true, chooser: false, canUndo: false, title: extra.title });
  refreshLook();
  if (editor.ui.tool !== TERRAIN_TOOL) {
    editor.setTool(TERRAIN_TOOL);
  }
  editor.clearSelection();
};
const end = () => {
  if (!current) {
    return;
  }
  const closing = current;
  current = null;
  closing.editor.viewer.helpers.remove(closing.mesh, closing.water);
  closing.mesh.geometry.dispose();
  (closing.mesh.material as THREE.Material).dispose();
  closing.water.geometry.dispose();
  (closing.water.material as THREE.Material).dispose();
  if (closing.inst) {
    closing.inst.hidden = false;
  }
  terrainUi.active = false;
  terrainUi.canUndo = false;
  closing.editor.invalidate();
};

const CELLS = { grob: 28, mittel: 48, fein: 80 };
/** Grid resolution for a size and the chosen detail level. */
const cellFor = (width: number, depth: number) => Math.max(0.1, Math.max(width, depth) / CELLS[terrainUi.detail]);

/**
 * Entry point of the terrain tool: edits a selected terrain group, turns a selected horizontal face
 * into terrain, or opens the "new terrain" chooser.
 */
export const openTerrain = (editor: Editor) => {
  if (current) {
    if (editor.ui.tool !== TERRAIN_TOOL) {
      editor.setTool(TERRAIN_TOOL);
    }
    return;
  }
  const sel = editor.selected();
  const inst = sel.find((entityRef) => entityRef.kind === 'instance');
  if (inst) {
    const instance = editor.entities.instances.get(inst.id);
    const storedTerrain = instance && terrainOf(instance.definition);
    if (instance && storedTerrain) {
      const origin = new THREE.Vector3().setFromMatrixPosition(editor.contextMatrix.clone().multiply(instance.matrix));
      begin(editor, storedTerrain, origin, { inst: instance, title: instance.name || instance.definition.name });
      return;
    }
  }
  const face = sel.find((entityRef) => entityRef.kind === 'face');
  if (face) {
    const existing = editor.entities.faces.get(face.id);
    if (existing && Math.abs(editor.entities.faceNormal(existing).z) > 0.999) {
      const pts = editor.entities.facePoints(existing).map((point) => point.clone().applyMatrix4(editor.contextMatrix));
      const box = new THREE.Box3().setFromPoints(pts);
      const size = box.getSize(new THREE.Vector3());
      if (size.x > 0.05 && size.y > 0.05) {
        const data = newTerrain(size.x, size.y, cellFor(size.x, size.y));
        begin(editor, data, new THREE.Vector3(box.min.x, box.min.y, box.min.z), {
          srcFace: { ents: editor.entities, id: existing.id },
          title: t('terrain.plugin.fromFace'),
        });
        return;
      }
    }
    editor.toast(t('terrain.session.needsFlatFace'));
  }
  terrainUi.chooser = true;
  if (editor.ui.tool !== TERRAIN_TOOL) {
    editor.setTool(TERRAIN_TOOL);
  }
};

/** Creates a new terrain from the chooser (next to the existing model, or centred on the origin). */
export const createNew = (editor: Editor) => {
  const width = Math.max(1, terrainUi.newW),
    depth = Math.max(1, terrainUi.newD);
  const data = newTerrain(width, depth, cellFor(width, depth));
  if (terrainUi.startHills) {
    generateHills(data, { height: Math.max(width, depth) * 0.12 });
  }
  const box = editor.model.bounds();
  const origin = box.isEmpty() ? new THREE.Vector3(-width / 2, -depth / 2, 0) : new THREE.Vector3(box.max.x + 2, box.min.y, 0);
  begin(editor, data, origin, { title: t('terrain.session.newTitle', { width, depth }) });
  editor.viewer.rig.zoomExtents(
    new THREE.Box3(origin, origin.clone().add(new THREE.Vector3(width, depth, Math.max(width, depth) * 0.2))),
    true,
  );
};

/** Bakes the terrain into the model – one undo step. */
export const applyTerrain = (switchTool = true) => {
  if (!current) {
    return;
  }
  const active = current;
  const editor = active.editor;
  // un-hide first so the undo snapshot taken by commit() has the old terrain visible
  if (active.inst) {
    active.inst.hidden = false;
  }
  const data = cloneTerrain(active.data);
  let made: Instance | null = null;
  try {
    editor.commit(active.inst ? 'terrain.plugin.edit' : 'terrain.plugin.toolName', () => {
      const ents = new Entities();
      bakeTerrain(ents, data, editor.model);
      if (active.inst) {
        const def = active.inst.definition;
        def.entities = ents;
        setTerrain(def, data);
        made = active.inst;
      } else {
        const def = editor.model.newDefinition(editor.model.uniqueDefName(t('terrain.plugin.toolName')), false, ents);
        setTerrain(def, data);
        const local = active.origin.clone().applyMatrix4(editor.contextInverse);
        made = editor.entities.addInstance(
          def,
          new THREE.Matrix4().makeTranslation(local.x, local.y, local.z),
          t('terrain.plugin.toolName'),
        );
        if (active.srcFace) {
          // the flat face is replaced by the terrain (edges that only bounded it go too)
          const { ents: entities, id } = active.srcFace;
          const face = entities.faces.get(id);
          if (face) {
            const edges = entities.faceEdges(face);
            entities.removeFace(id);
            for (const edge of edges) {
              if (!entities.facesOfEdge(edge.id).length) {
                entities.eraseEdge(edge.id, false);
              }
            }
            entities.removeOrphanVertices();
          }
        }
      }
    });
  } catch {
    if (active.inst) {
      active.inst.hidden = true;
    }
    return;
  }
  active.inst = null; // already visible again
  end();
  if (made) {
    editor.select([{ kind: 'instance', id: (made as Instance).id }]);
  }
  if (switchTool) {
    editor.setTool('select');
  }
  editor.toast(t('terrain.session.applied'));
};

/** Throws the sculpting away. */
export const discardTerrain = () => {
  if (!current) {
    terrainUi.chooser = false;
    return;
  }
  const editor = current.editor;
  end();
  editor.setTool('select');
  editor.toast(t('terrain.session.discarded'));
};
export const closeChooser = (editor: Editor) => {
  terrainUi.chooser = false;
  if (!current && editor.ui.tool === TERRAIN_TOOL) {
    editor.setTool('select');
  }
};

// ------------------------------------------------------------------ editing helpers (used by tool + panel)
export const pushUndo = () => {
  if (!current) {
    return;
  }
  current.undo.push(current.data.heights.slice());
  if (current.undo.length > 60) {
    current.undo.shift();
  }
  terrainUi.canUndo = true;
};
export const undoStroke = () => {
  if (!current || !current.undo.length) {
    return false;
  }
  current.data.heights = current.undo.pop()!;
  terrainUi.canUndo = current.undo.length > 0;
  syncGeometry();
  return true;
};
export const generate = (kind: 'hills' | 'mountains' | 'flat') => {
  if (!current) {
    return;
  }
  pushUndo();
  const terrain = current.data;
  const extent = Math.max(terrain.width, terrain.depth);
  if (kind === 'flat') {
    terrain.heights.fill(0);
  } else if (kind === 'hills') {
    generateHills(terrain, { height: extent * 0.06, scale: extent / 4 });
  } else {
    generateHills(terrain, { height: extent * 0.25, scale: extent / 2.5 });
  }
  syncGeometry();
};

/** World hit point on the terrain under the mouse (null when the cursor is off the terrain). */
export const hitTerrain = (x: number, y: number): THREE.Vector3 | null => {
  if (!current) {
    return null;
  }
  const raycaster = new THREE.Raycaster();
  raycaster.ray.copy(current.editor.viewer.ray(x, y));
  current.mesh.updateMatrixWorld();
  const hit = raycaster.intersectObject(current.mesh, false)[0];
  return hit ? hit.point.clone() : null;
};
export const toGrid = (point: THREE.Vector3) =>
  current ? { x: point.x - current.origin.x, y: point.y - current.origin.y } : { x: 0, y: 0 };
export const gridHeight = (x: number, y: number) => (current ? heightAt(current.data, x, y) : 0);
export const gridToWorld = (x: number, y: number, z: number) =>
  current ? new THREE.Vector3(current.origin.x + x, current.origin.y + y, current.origin.z + z) : new THREE.Vector3();
export const dab = (x: number, y: number, elapsed: number, invert: boolean, target: number) => {
  if (!current) {
    return false;
  }
  return applyBrush(current.data, terrainUi.brush, x, y, elapsed, invert, target);
};
export const stats = () => {
  if (!current) {
    return null;
  }
  const terrain = current.data;
  let lowest = Infinity,
    highest = -Infinity;
  for (const height of terrain.heights) {
    if (height < lowest) {
      lowest = height;
    }
    if (height > highest) {
      highest = height;
    }
  }
  const { cx: cellX } = cellSize(terrain);
  return { width: terrain.width, depth: terrain.depth, columns: terrain.columns, rows: terrain.rows, cellSize: cellX, lowest, highest };
};
