import * as THREE from 'three';
import { Definition, Entities, ensureIdAbove, newId, type DefinitionRegistry, type Instance } from './model';
import { t } from '../i18n';

export interface MaterialDef {
  name: string;
  color: string;
  opacity: number;
  texture?: string;
  /** width (m) one texture tile covers – the height follows the image's proportions */
  textureSize?: number;
  /** the user's own image (data URL, saved with the model) – drawn as it is, instead of a procedural texture */
  image?: string;
  /** height / width of the image, so the tile keeps its proportions */
  imageAspect?: number;
  /** where the texture starts on a face (m along the face's axes) */
  textureOffset?: [number, number];
  /** turn of the texture on a face (degrees) */
  textureRotation?: number;
  /** a surface shader registered by a plugin (e.g. "shaders.wood") – drawn instead of colour and texture while the plugin is on */
  shader?: string;
  /** the shader's parameters (numbers, colours as "#rrggbb") – missing ones take the shader's defaults */
  shaderParams?: Record<string, number | string>;
}
/** a copy that shares nothing with the original */
export const copyMaterial = (material: MaterialDef): MaterialDef => {
  const copy = { ...material };
  if (material.shaderParams) {
    copy.shaderParams = { ...material.shaderParams };
  }
  if (material.textureOffset) {
    copy.textureOffset = [material.textureOffset[0], material.textureOffset[1]];
  }
  return copy;
};
export interface Tag {
  name: string;
  visible: boolean;
  color: string;
}
export interface Guide {
  id: number;
  kind: 'line' | 'point';
  point: THREE.Vector3;
  direction?: THREE.Vector3;
}
export interface Dimension {
  id: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  offset: THREE.Vector3;
}
export interface Label {
  id: number;
  point: THREE.Vector3;
  text: string;
  offset: THREE.Vector3;
}
export interface SectionPlane {
  id: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  active: boolean;
  name: string;
}
/** Version tag of the saved model files (.shap3d.json, autosave). */
export const MODEL_FORMAT = 'shap3d/2';

export interface CameraState {
  position: number[];
  target: number[];
  fov: number;
  ortho: boolean;
}
export interface Scene {
  id: number;
  name: string;
  camera: CameraState;
  style?: Partial<StyleSettings>;
  hiddenTags?: string[];
  /** small JPEG of the view (data URL) – shown when hovering the scene tab */
  thumbnail?: string;
}

export type Units = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type FaceStyle = 'wireframe' | 'hiddenline' | 'shaded' | 'textured' | 'monochrome';

export interface StyleSettings {
  faceStyle: FaceStyle;
  xray: boolean;
  backEdges: boolean;
  edges: boolean;
  profiles: boolean;
  frontColor: string;
  backColor: string;
  skyColor: string;
  groundColor: string;
  sky: boolean;
  ground: boolean;
  edgeColor: string;
}

export interface ModelSettings {
  units: Units;
  precision: number;
  axes: boolean;
  guides: boolean;
  sectionPlanes: boolean;
  sectionCuts: boolean;
  shadows: boolean;
  shadowHour: number; // 0..24
  shadowMonth: number; // 1..12
  hiddenGeometry: boolean;
  /** tabs for the scenes above the viewport */
  sceneTabs: boolean;
  style: StyleSettings;
}

export const DEFAULT_STYLE: StyleSettings = {
  faceStyle: 'textured',
  xray: false,
  backEdges: false,
  edges: true,
  profiles: true,
  frontColor: '#ffffff',
  backColor: '#b9c9d3',
  skyColor: '#c4d3de',
  groundColor: '#ccccc9',
  sky: true,
  ground: true,
  edgeColor: '#000000',
};

// i18n-ignore-start – material names are model content
export const DEFAULT_MATERIALS: MaterialDef[] = [
  { name: 'Ziegel', color: '#b5523b', opacity: 1 },
  { name: 'Beton', color: '#a7a39b', opacity: 1 },
  { name: 'Holz hell', color: '#d8b07a', opacity: 1 },
  { name: 'Holz dunkel', color: '#7a4b2a', opacity: 1 },
  { name: 'Glas', color: '#9fd3e6', opacity: 0.35 },
  { name: 'Rasen', color: '#6aa84f', opacity: 1 },
  { name: 'Wasser', color: '#3d85c6', opacity: 0.6 },
  { name: 'Metall', color: '#8f9aa5', opacity: 1 },
  { name: 'Dach rot', color: '#a83a2a', opacity: 1 },
  { name: 'Putz weiß', color: '#f1eee6', opacity: 1 },
  { name: 'Stein grau', color: '#6f6f6f', opacity: 1 },
  { name: 'Sand', color: '#e3cf9c', opacity: 1 },
  { name: 'Rot', color: '#e53935', opacity: 1 },
  { name: 'Orange', color: '#fb8c00', opacity: 1 },
  { name: 'Gelb', color: '#fdd835', opacity: 1 },
  { name: 'Grün', color: '#43a047', opacity: 1 },
  { name: 'Blau', color: '#1e88e5', opacity: 1 },
  { name: 'Violett', color: '#8e24aa', opacity: 1 },
  { name: 'Schwarz', color: '#222222', opacity: 1 },
  { name: 'Weiß', color: '#ffffff', opacity: 1 },
];
// i18n-ignore-end

export class Model implements DefinitionRegistry {
  root = new Entities();
  definitions = new Map<number, Definition>();
  materials: MaterialDef[] = DEFAULT_MATERIALS.map((material) => ({ ...material }));
  tags: Tag[] = [{ name: 'Untagged', visible: true, color: '#888888' }];
  guides: Guide[] = [];
  dimensions: Dimension[] = [];
  labels: Label[] = [];
  sections: SectionPlane[] = [];
  scenes: Scene[] = [];
  settings: ModelSettings = {
    units: 'mm',
    precision: 2,
    axes: true,
    guides: true,
    sectionPlanes: true,
    sectionCuts: true,
    shadows: false,
    shadowHour: 13.5,
    shadowMonth: 6,
    hiddenGeometry: false,
    sceneTabs: true,
    style: { ...DEFAULT_STYLE },
  };
  name = t('names.untitled');

  material(name?: string): MaterialDef | undefined {
    if (!name) {
      return undefined;
    }
    const material = this.materials.find((x) => x.name === name);
    if (material) {
      return material;
    }
    // plain colours ("#rrggbb") work as anonymous materials, e.g. for imported illustrations
    return /^#[0-9a-f]{6}$/i.test(name) ? { name, color: name, opacity: 1 } : undefined;
  }
  hiddenTags(): Set<string> {
    return new Set(this.tags.filter((tag) => !tag.visible).map((tag) => tag.name));
  }

  newDefinition(name: string, isComponent: boolean, entities = new Entities()): Definition {
    const definition = new Definition(name, isComponent, entities);
    this.definitions.set(definition.id, definition);
    return definition;
  }
  cloneDefinition(source: Definition): Definition {
    const definition = new Definition(source.name, source.isComponent, source.entities.clone(this));
    definition.faceMe = source.faceMe;
    if (source.pluginData) {
      definition.pluginData = JSON.parse(JSON.stringify(source.pluginData));
    }
    if (source.shape) {
      definition.shape = JSON.parse(JSON.stringify(source.shape));
    }
    this.definitions.set(definition.id, definition);
    return definition;
  }
  uniqueDefName(base: string) {
    let i = 1;
    const names = new Set([...this.definitions.values()].map((definition) => definition.name));
    while (names.has(`${base}#${i}`)) {
      i++;
    }
    return `${base}#${i}`;
  }

  /** Definitions (groups/components) that no instance refers to any more. */
  unusedDefinitions(): number[] {
    const used = new Set<number>();
    const walk = (entities: Entities) => {
      for (const instance of entities.instances.values()) {
        if (!used.has(instance.definition.id)) {
          used.add(instance.definition.id);
          walk(instance.definition.entities);
        }
      }
    };
    walk(this.root);
    return [...this.definitions.keys()].filter((id) => !used.has(id));
  }

  /** Remove definitions that are not referenced anymore. */
  purge() {
    for (const id of this.unusedDefinitions()) {
      this.definitions.delete(id);
    }
  }

  bounds(): THREE.Box3 {
    return this.root.bounds(new THREE.Box3(), new THREE.Matrix4(), this.hiddenTags());
  }

  /**
   * data plugins keep on the model itself, by plugin id (e.g. the sheets of the layout plugin) –
   * plain JSON, saved with the model and kept while the plugin is off
   */
  pluginData?: Record<string, unknown>;

  clear() {
    this.root = new Entities();
    this.definitions.clear();
    this.guides = [];
    this.dimensions = [];
    this.labels = [];
    this.sections = [];
    this.pluginData = undefined;
  }

  // ---------------- serialization ----------------
  toJSON(): any {
    const round = (value: number) => +value.toFixed(6);
    const toArray = (vector: THREE.Vector3) => [vector.x, vector.y, vector.z];
    const entitiesToJSON = (entities: Entities) => ({
      vertices: [...entities.vertices.values()].map((vertex) => ({ id: vertex.id, position: toArray(vertex.position).map(round) })),
      edges: [...entities.edges.values()].map((edge) => ({
        id: edge.id,
        start: edge.start,
        end: edge.end,
        soft: edge.soft || undefined,
        hidden: edge.hidden || undefined,
        tag: edge.tag,
      })),
      // loops are copied: edits split them in place, which would otherwise corrupt older undo snapshots
      faces: [...entities.faces.values()].map((face) => ({
        id: face.id,
        outer: [...face.outer],
        holes: face.holes.length ? face.holes.map((hole) => [...hole]) : undefined,
        material: face.material,
        backMaterial: face.backMaterial,
        tag: face.tag,
        hidden: face.hidden || undefined,
      })),
      instances: [...entities.instances.values()].map((instance) => ({
        id: instance.id,
        definition: instance.definition.id,
        matrix: instance.matrix.toArray().map(round),
        name: instance.name,
        material: instance.material,
        tag: instance.tag,
        hidden: instance.hidden || undefined,
        locked: instance.locked || undefined,
      })),
    });
    return {
      format: MODEL_FORMAT,
      name: this.name,
      // copies, not references – undo snapshots must not change when the model changes later
      settings: JSON.parse(JSON.stringify(this.settings)),
      materials: this.materials.map(copyMaterial),
      tags: this.tags.map((tag) => ({ ...tag })),
      definitions: [...this.definitions.values()].map((definition) => ({
        id: definition.id,
        name: definition.name,
        isComponent: definition.isComponent,
        faceMe: definition.faceMe || undefined,
        pluginData: definition.pluginData ? JSON.parse(JSON.stringify(definition.pluginData)) : undefined,
        shape: definition.shape,
        entities: entitiesToJSON(definition.entities),
      })),
      root: entitiesToJSON(this.root),
      pluginData: this.pluginData ? JSON.parse(JSON.stringify(this.pluginData)) : undefined,
      guides: this.guides.map((guide) => ({
        id: guide.id,
        kind: guide.kind,
        point: toArray(guide.point),
        direction: guide.direction ? toArray(guide.direction) : undefined,
      })),
      dimensions: this.dimensions.map((dimension) => ({
        id: dimension.id,
        start: toArray(dimension.start),
        end: toArray(dimension.end),
        offset: toArray(dimension.offset),
      })),
      labels: this.labels.map((label) => ({ id: label.id, point: toArray(label.point), text: label.text, offset: toArray(label.offset) })),
      sections: this.sections.map((section) => ({
        id: section.id,
        point: toArray(section.point),
        normal: toArray(section.normal),
        active: section.active,
        name: section.name,
      })),
      scenes: JSON.parse(
        JSON.stringify(
          this.scenes.map((scene) => ({
            ...scene,
            camera: { position: scene.camera.position, target: scene.camera.target, fov: scene.camera.fov, ortho: scene.camera.ortho },
          })),
        ),
      ),
    };
  }

  static fromJSON(json: any): Model {
    const model = new Model();
    model.load(json);
    return model;
  }

  load(json: any) {
    if (json?.format !== MODEL_FORMAT) {
      throw new Error(t('errors.unknownFileFormat'));
    }
    this.clear();
    let maxId = 0;
    const seen = (id: number) => {
      if (id > maxId) {
        maxId = id;
      }
      return id;
    };
    const toVector = (values: number[]) => new THREE.Vector3(values[0], values[1], values[2]);
    this.name = json.name ?? t('names.untitled');
    this.settings = { ...this.settings, ...json.settings, style: { ...DEFAULT_STYLE, ...json.settings?.style } };
    this.pluginData = json.pluginData ? JSON.parse(JSON.stringify(json.pluginData)) : undefined;
    if (json.materials) {
      this.materials = json.materials.map(copyMaterial);
    }
    if (json.tags) {
      this.tags = json.tags.map((tag: Tag) => ({ ...tag }));
    }
    const definitions = new Map<number, Definition>();
    for (const stored of json.definitions ?? []) {
      const definition = new Definition(stored.name, !!stored.isComponent);
      definition.faceMe = !!stored.faceMe;
      if (stored.pluginData) {
        definition.pluginData = JSON.parse(JSON.stringify(stored.pluginData));
      } else if (stored.terrain) {
        definition.pluginData = { terrain: stored.terrain };
      } // files from before the terrain plugin
      if (stored.shape) {
        definition.shape = stored.shape;
      }
      (definition as any).id = seen(stored.id);
      definitions.set(stored.id, definition);
      this.definitions.set(stored.id, definition);
    }
    const fill = (entities: Entities, stored: any) => {
      for (const vertex of stored.vertices) {
        entities.rawVertex(toVector(vertex.position), seen(vertex.id));
      }
      for (const edge of stored.edges) {
        entities.createEdgeRaw(
          edge.start,
          edge.end,
          { soft: edge.soft || undefined, hidden: edge.hidden || undefined, tag: edge.tag },
          seen(edge.id),
        );
      }
      for (const face of stored.faces) {
        entities.createFaceRaw(
          face.outer,
          face.holes ?? [],
          { material: face.material, backMaterial: face.backMaterial, tag: face.tag, hidden: face.hidden || undefined },
          seen(face.id),
        );
      }
      for (const instance of stored.instances) {
        const definition = definitions.get(instance.definition);
        if (!definition) {
          continue;
        }
        const loaded: Instance = {
          id: seen(instance.id),
          definition: definition,
          matrix: new THREE.Matrix4().fromArray(instance.matrix),
          name: instance.name ?? '',
          material: instance.material,
          tag: instance.tag,
          hidden: !!instance.hidden,
          locked: !!instance.locked,
        };
        entities.instances.set(loaded.id, loaded);
      }
    };
    for (const stored of json.definitions ?? []) {
      fill(definitions.get(stored.id)!.entities, stored.entities);
    }
    fill(this.root, json.root);
    this.guides = (json.guides ?? []).map((guide: any): Guide => ({
      id: seen(guide.id),
      kind: guide.kind,
      point: toVector(guide.point),
      direction: guide.direction ? toVector(guide.direction) : undefined,
    }));
    this.dimensions = (json.dimensions ?? []).map((dimension: any): Dimension => ({
      id: seen(dimension.id),
      start: toVector(dimension.start),
      end: toVector(dimension.end),
      offset: toVector(dimension.offset),
    }));
    this.labels = (json.labels ?? []).map((label: any): Label => ({
      id: seen(label.id),
      point: toVector(label.point),
      text: label.text,
      offset: toVector(label.offset),
    }));
    this.sections = (json.sections ?? []).map((section: any): SectionPlane => ({
      id: seen(section.id),
      point: toVector(section.point),
      normal: toVector(section.normal),
      active: !!section.active,
      name: section.name ?? t('names.section'),
    }));
    this.scenes = (json.scenes ?? []).map((scene: any): Scene => ({
      ...scene,
      camera: { position: scene.camera.position, target: scene.camera.target, fov: scene.camera.fov, ortho: scene.camera.ortho },
    }));
    ensureIdAbove(maxId);
  }
}

export { newId };
