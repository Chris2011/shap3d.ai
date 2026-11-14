import * as THREE from 'three';
import { buildMesh, parseObj } from '../mesh';
import { toVec, type Pt } from '../points';
import type { FaceHandle, GroupHandle } from '../handles';
import { ScriptSketch } from './scriptSketch';

/**
 * Angular solids, each as its own group: box, pyramid, prism, wedge, stairs – and meshes from OBJ text.
 */
export class ScriptSolids extends ScriptSketch {
  /** Box as a group (default) or raw geometry. */
  box(
    corner: Pt,
    width: number | string,
    depth: number | string,
    height: number | string,
    opts: { group?: boolean; name?: string; material?: string } = {},
  ): GroupHandle | FaceHandle {
    const make = () => {
      const face = this.rect(corner, width, depth);
      return face.pushpull(height);
    };
    if (opts.group === false) {
      const result = make();
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
      return result!;
    }
    return this.group(opts.name ?? 'Quader', () => {
      make();
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  /** Pyramid on `center` – `size` is the base edge length (4 sides) or the edge of the regular n-gon. */
  pyramid(
    center: Pt,
    size: number | string,
    height: number | string,
    opts: { sides?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center),
      sides = Math.max(3, opts.sides ?? 4),
      heightValue = this.length(height);
    const radiusValue = this.length(size) / (2 * Math.sin(Math.PI / sides));
    return this.group(opts.name ?? 'Pyramide', () => {
      const entities = this.ents;
      const base: number[] = [];
      for (let i = 0; i < sides; i++) {
        const angle = Math.PI / sides + (i / sides) * Math.PI * 2 - (sides === 4 ? Math.PI / 2 : 0);
        base.push(
          entities.addVertex(
            new THREE.Vector3(centerVec.x + Math.cos(angle) * radiusValue, centerVec.y + Math.sin(angle) * radiusValue, centerVec.z),
          ),
        );
      }
      const apex = entities.addVertex(new THREE.Vector3(centerVec.x, centerVec.y, centerVec.z + heightValue));
      entities.createFaceRaw([...base].reverse());
      for (let i = 0; i < sides; i++) {
        entities.createFaceRaw([base[i], base[(i + 1) % sides], apex]);
      }
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Upright prism with a regular n-gon base (6 = hexagon). */
  prism(
    center: Pt,
    radius: number | string,
    height: number | string,
    opts: { sides?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    return this.group(opts.name ?? 'Prisma', () => {
      this.polygon(center, radius, opts.sides ?? 6).pushpull(height);
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  /** Wedge/ramp: footprint w × d from corner `at`, rising along +x to height h. */
  wedge(
    corner: Pt,
    width: number | string,
    depth: number | string,
    height: number | string,
    opts: { name?: string; material?: string } = {},
  ): GroupHandle {
    const base = toVec(corner),
      widthValue = this.length(width),
      depthValue = this.length(depth),
      heightValue = this.length(height);
    return this.group(opts.name ?? 'Keil', () => {
      const entities = this.ents;
      const vertexAt = (x: number, y: number, z: number) => entities.addVertex(new THREE.Vector3(base.x + x, base.y + y, base.z + z));
      const base0 = vertexAt(0, 0, 0),
        base1 = vertexAt(widthValue, 0, 0),
        base2 = vertexAt(widthValue, depthValue, 0),
        base3 = vertexAt(0, depthValue, 0),
        top1 = vertexAt(widthValue, 0, heightValue),
        top2 = vertexAt(widthValue, depthValue, heightValue);
      entities.createFaceRaw([base0, base3, base2, base1]);
      entities.createFaceRaw([base1, base2, top2, top1]);
      entities.createFaceRaw([base0, base1, top1]);
      entities.createFaceRaw([base3, top2, base2]);
      entities.createFaceRaw([base0, top1, top2, base3]);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Straight staircase starting at `at`, climbing along +x. Defaults: 10 steps, 17.5 cm rise, 28 cm run, 1 m wide. */
  stairs(
    corner: Pt,
    opts: { steps?: number; rise?: number | string; run?: number | string; width?: number | string; name?: string; material?: string } = {},
  ): GroupHandle {
    const base = toVec(corner),
      steps = Math.max(1, Math.round(opts.steps ?? 10)),
      rise = this.length(opts.rise ?? 0.175),
      run = this.length(opts.run ?? 0.28),
      widthValue = this.length(opts.width ?? 1);
    return this.group(opts.name ?? 'Treppe', () => {
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(steps * run, 0, 0),
        new THREE.Vector3(steps * run, 0, steps * rise),
      ];
      for (let i = steps - 1; i >= 0; i--) {
        pts.push(new THREE.Vector3(i * run, 0, (i + 1) * rise));
        if (i > 0) {
          pts.push(new THREE.Vector3(i * run, 0, i * rise));
        }
      }
      this.face(pts.map((point) => point.add(base))).extrude(widthValue, 'y');
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  /** OBJ mesh text (`v …` / `f …` lines, e.g. from LLaMA-Mesh) as a group; `size` = largest side. */
  mesh(
    obj: string,
    opts: { at?: Pt; size?: number | string; yUp?: boolean; smooth?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const group = this.group(opts.name ?? 'Mesh', () => {
      buildMesh(this.ents, parseObj(obj), { size: this.length(opts.size ?? 1), yUp: opts.yUp, smooth: opts.smooth });
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
    if (opts.at) {
      group.move(opts.at);
    }
    return group;
  }
}
