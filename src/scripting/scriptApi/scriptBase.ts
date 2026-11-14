import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import type { Entities } from '../../core/model';
import { parseLength } from '../../core/units';
import { offsetPolygon } from '../../core/geometry';
import { TEXTURES, isTextureKind } from '../../core/textures';
import { SURFACE_SHADERS, surfaceShader } from '../../engine/surfaceShaders';
import { MATERIAL_LIBRARY, libraryMaterial } from '../../core/materialLibrary';
import { t } from '../../i18n';
import type { ScriptLog } from '../scriptTypes';

/**
 * The base of the `s3d` object: where it builds (a stack of entity containers), units, console output, materials and tags.
 */
export class ScriptBase {
  protected stack: Entities[] = [];
  logs: ScriptLog[] = [];
  constructor(
    public editor: Editor,
    root?: Entities,
  ) {
    this.stack = [root ?? editor.entities];
  }
  get ents(): Entities {
    return this.stack[this.stack.length - 1];
  }
  length(value: number | string): number {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = parseLength(value, this.editor.model.settings.units);
    if (parsed == null) {
      throw new Error(t('script.errors.invalidLength', { value }));
    }
    return parsed;
  }
  point(x = 0, y = 0, z = 0) {
    return [x, y, z] as [number, number, number];
  }
  millimeters(value: number) {
    return value / 1000;
  }
  centimeters(value: number) {
    return value / 100;
  }
  meters(value: number) {
    return value;
  }
  degrees(value: number) {
    return (value * Math.PI) / 180;
  }
  get THREE() {
    return THREE;
  }
  log(...args: any[]) {
    this.logs.push({ kind: 'log', text: args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') });
  }
  warn(...args: any[]) {
    this.logs.push({ kind: 'warn', text: args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') });
  }
  ensureMaterial(name: string, color?: string, opacity = 1): string {
    const material = this.editor.model.materials.find((x) => x.name === name);
    if (material) {
      if (color) {
        material.color = color;
        material.opacity = opacity;
      }
      return name;
    }
    // ready-made materials ('Glas', 'Eiche hell', 'Stahl' …) need no definition
    const lib = !color ? libraryMaterial(name) : undefined;
    if (lib) {
      this.editor.model.materials.push({
        name: lib.name,
        color: lib.color,
        opacity: lib.opacity ?? 1,
        texture: lib.texture,
        textureSize: lib.size,
      });
      return lib.name;
    }
    let resolved = color;
    if (!resolved) {
      if (/^#|^rgb/i.test(name)) {
        resolved = name;
      } else {
        const tmp = new THREE.Color();
        try {
          tmp.setStyle(name);
          resolved = '#' + tmp.getHexString();
        } catch {
          resolved = '#cccccc';
        }
      }
    }
    this.editor.model.materials.push({ name, color: resolved!, opacity });
    return name;
  }
  ensureTag(name: string) {
    if (!this.editor.model.tags.some((tag) => tag.name === name)) {
      this.editor.model.tags.push({ name, visible: true, color: '#' + new THREE.Color().setHSL(Math.random(), 0.5, 0.6).getHexString() });
    }
    return name;
  }
  /** Define or update a material. */
  /**
   * Define or update a material. Third argument: opacity (0..1) or options
   * { opacity, texture: 'holz'|'ziegel'|'stein'|'gras'|'fliesen'|'beton'|'metall'|'stoff'|'wasser'|'marmor'|'dach'|'parkett', size: meters,
   *   shader: a shader of a plugin, e.g. 'shaders.wood', params: { … } }.
   */
  material(
    name: string,
    color?: string,
    opts: number | { opacity?: number; texture?: string; size?: number; shader?: string; params?: Record<string, number | string> } = 1,
  ) {
    if (color == null) {
      const materialName = this.ensureMaterial(name);
      return materialName;
    } // library material or CSS colour name
    const options = typeof opts === 'number' ? { opacity: opts } : opts;
    this.ensureMaterial(name, color, options.opacity ?? 1);
    const material = this.editor.model.materials.find((x) => x.name === name)!;
    if (options.texture !== undefined) {
      if (options.texture && !isTextureKind(options.texture)) {
        throw new Error(t('script.errors.unknownTexture', { texture: options.texture, allowed: Object.keys(TEXTURES).join(', ') }));
      }
      material.texture = options.texture || undefined;
    }
    if (options.size) {
      material.textureSize = this.length(options.size);
    }
    if (options.shader !== undefined) {
      if (options.shader && !surfaceShader(options.shader)) {
        throw new Error(
          t('script.errors.unknownShader', {
            shader: options.shader,
            allowed: SURFACE_SHADERS.map((shader) => shader.id).join(', ') || '–',
          }),
        );
      }
      material.shader = options.shader || undefined;
      material.shaderParams = undefined;
      if (material.shader) {
        material.texture = undefined;
      }
    }
    if (options.params) {
      material.shaderParams = { ...material.shaderParams, ...options.params };
    }
    return name;
  }
  tag(name: string, visible = true) {
    this.ensureTag(name);
    const tag = this.editor.model.tags.find((x) => x.name === name)!;
    tag.visible = visible;
    return name;
  }
  /** Names of the ready-made materials (optionally one category, e.g. 'Holz', 'Metall'). */
  materials(category?: string): string[] {
    return MATERIAL_LIBRARY.filter((material) => !category || material.category.toLowerCase().startsWith(category.toLowerCase())).map(
      (material) => material.name,
    );
  }
  /** Texture kinds usable in s3d.material(name, color, { texture }). */
  textures(): string[] {
    return Object.keys(TEXTURES);
  }
  protected paintAll(entities: Entities, material: string) {
    const materialName = this.ensureMaterial(material);
    for (const face of entities.faces.values()) {
      face.material = materialName;
    }
  }
  offsetFace(entities: Entities, faceId: number, distance: number) {
    const face = entities.faces.get(faceId)!;
    entities.addLoop(offsetPolygon(entities.facePoints(face), entities.faceNormal(face), distance));
  }
  random(min = 0, max = 1) {
    return min + Math.random() * (max - min);
  }
  stats() {
    return this.editor.model.root.stats();
  }
}
