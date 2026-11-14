import * as THREE from 'three';
import { t } from '../../i18n';
import { toVec, type Pt } from '../points';
import type { FaceHandle, GroupHandle } from '../handles';
import { ScriptSolids } from './scriptSolids';

/**
 * Round solids, each as its own group: cylinder, rod, cone, sphere, ellipsoid, dome, tube and torus.
 */
export class ScriptRoundSolids extends ScriptSolids {
  cylinder(
    center: Pt,
    radius: number | string,
    height: number | string,
    opts: { segments?: number; group?: boolean; name?: string; material?: string } = {},
  ): GroupHandle | FaceHandle {
    const make = () => this.circle(center, radius, { segments: opts.segments ?? 24 }).pushpull(height);
    if (opts.group === false) {
      return make()!;
    }
    return this.group(opts.name ?? 'Zylinder', () => {
      make();
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  /** Cylinder (or cone when endRadius is given) from point a to point b – handy for legs, branches, pipes. */
  cylinderBetween(
    fromPoint: Pt,
    toPoint: Pt,
    radius: number | string,
    opts: { endRadius?: number | string; segments?: number; name?: string; material?: string; group?: boolean } = {},
  ): GroupHandle | null {
    const start = toVec(fromPoint),
      end = toVec(toPoint);
    const span = start.distanceTo(end);
    if (span < 1e-6) {
      return null;
    }
    const startRadius = this.length(radius),
      endRadius = opts.endRadius != null ? this.length(opts.endRadius) : startRadius;
    const segments = opts.segments ?? 12;
    const make = () => {
      const dir = end.clone().sub(start).normalize();
      const basisU =
        Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
      const basisW = dir.clone().cross(basisU).normalize();
      const ring = (center: THREE.Vector3, ringRadius: number) => {
        const out: THREE.Vector3[] = [];
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          out.push(
            center
              .clone()
              .addScaledVector(basisU, Math.cos(angle) * ringRadius)
              .addScaledVector(basisW, Math.sin(angle) * ringRadius),
          );
        }
        return out;
      };
      const entities = this.ents;
      const startRing = ring(start, startRadius).map((point) => entities.addVertex(point));
      const endRing = endRadius > 1e-6 ? ring(end, endRadius).map((point) => entities.addVertex(point)) : null;
      const tip = endRing ? -1 : entities.addVertex(end);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        if (endRing) {
          entities.createFaceRaw([startRing[i], startRing[j], endRing[j], endRing[i]]);
        } else {
          entities.createFaceRaw([startRing[i], startRing[j], tip]);
        }
      }
      entities.createFaceRaw([...startRing].reverse());
      if (endRing) {
        entities.createFaceRaw(endRing);
      }
      entities.autoSoften([...entities.edges.keys()], 35);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    };
    if (opts.group === false) {
      make();
      return null;
    }
    return this.group(opts.name ?? 'Zylinder', make);
  }
  // ---------------- more solids ----------------
  /** Cone (or truncated cone with endRadius) standing on `center`. */
  cone(
    center: Pt,
    radius: number | string,
    height: number | string,
    opts: { endRadius?: number | string; segments?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center);
    return this.cylinderBetween(centerVec, centerVec.clone().add(new THREE.Vector3(0, 0, this.length(height))), radius, {
      endRadius: opts.endRadius ?? 0,
      segments: opts.segments ?? 24,
      name: opts.name ?? 'Kegel',
      material: opts.material,
    })!;
  }
  sphere(center: Pt, radius: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const centerVec = toVec(center),
      radiusValue = this.length(radius),
      segments = opts.segments ?? 24;
    return this.group(opts.name ?? 'Kugel', () => {
      // latitude rings around the Z axis
      const prof: THREE.Vector3[] = [];
      for (let i = 0; i <= segments / 2; i++) {
        const angle = -Math.PI / 2 + (i / (segments / 2)) * Math.PI;
        prof.push(new THREE.Vector3(centerVec.x + Math.cos(angle) * radiusValue, centerVec.y, centerVec.z + Math.sin(angle) * radiusValue));
      }
      const rings = prof.map((point) => {
        const ringRadius = Math.hypot(point.x - centerVec.x, point.y - centerVec.y);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          pts.push(new THREE.Vector3(centerVec.x + Math.cos(angle) * ringRadius, centerVec.y + Math.sin(angle) * ringRadius, point.z));
        }
        return pts;
      });
      const entities = this.ents;
      for (let j = 0; j < rings.length - 1; j++) {
        for (let i = 0; i < segments; i++) {
          const cornerA = rings[j][i],
            cornerB = rings[j][(i + 1) % segments],
            cornerC = rings[j + 1][(i + 1) % segments],
            cornerD = rings[j + 1][i];
          const ids = [cornerA, cornerB, cornerC, cornerD].map((point) => entities.addVertex(point));
          const uniq = ids.filter((x, k) => ids.indexOf(x) === k);
          if (uniq.length >= 3) {
            entities.createFaceRaw(uniq);
          }
        }
      }
      entities.autoSoften([...entities.edges.keys()], 45);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Ellipsoid with radii rx, ry, rz (bodies, heads, leaves …). */
  ellipsoid(
    center: Pt,
    radiusX: number | string,
    radiusY: number | string,
    radiusZ: number | string,
    opts: { segments?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const group = this.sphere([0, 0, 0], 1, { segments: opts.segments ?? 16, name: opts.name ?? 'Ellipsoid', material: opts.material });
    const centerVec = toVec(center);
    group.inst.matrix.makeScale(this.length(radiusX), this.length(radiusY), this.length(radiusZ)).setPosition(centerVec);
    return group;
  }
  /** Half sphere (dome) sitting on `center`. */
  dome(center: Pt, radius: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const centerVec = toVec(center),
      radiusValue = this.length(radius),
      segments = opts.segments ?? 24,
      rings = Math.max(3, Math.round(segments / 4));
    return this.group(opts.name ?? 'Kuppel', () => {
      const entities = this.ents;
      const ring = (k: number) => {
        const angle = ((k / rings) * Math.PI) / 2,
          ringRadius = Math.cos(angle) * radiusValue,
          z = Math.sin(angle) * radiusValue;
        return Array.from({ length: segments }, (_, i) => {
          const segmentAngle = (i / segments) * Math.PI * 2;
          return entities.addVertex(
            new THREE.Vector3(
              centerVec.x + Math.cos(segmentAngle) * ringRadius,
              centerVec.y + Math.sin(segmentAngle) * ringRadius,
              centerVec.z + z,
            ),
          );
        });
      };
      const ringIds = Array.from({ length: rings + 1 }, (_, k) => ring(k));
      for (let k = 0; k < rings; k++) {
        for (let i = 0; i < segments; i++) {
          const j = (i + 1) % segments;
          const ids = [ringIds[k][i], ringIds[k][j], ringIds[k + 1][j], ringIds[k + 1][i]];
          const uniq = ids.filter((x, position) => ids.indexOf(x) === position);
          if (uniq.length >= 3) {
            entities.createFaceRaw(uniq);
          }
        }
      }
      entities.createFaceRaw([...ringIds[0]].reverse());
      entities.autoSoften([...entities.edges.keys()], 45);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Hollow cylinder (pipe, ring, cup) standing on `center`. */
  tube(
    center: Pt,
    rOuter: number | string,
    rInner: number | string,
    height: number | string,
    opts: { segments?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center),
      outerRadius = this.length(rOuter),
      innerRadius = this.length(rInner),
      heightValue = this.length(height),
      segments = opts.segments ?? 24;
    if (!(innerRadius > 0 && innerRadius < outerRadius)) {
      throw new Error(t('script.errors.tubeRadius'));
    }
    return this.group(opts.name ?? 'Rohr', () => {
      const entities = this.ents;
      const ring = (ringRadius: number, z: number) =>
        Array.from({ length: segments }, (_, i) => {
          const angle = (i / segments) * Math.PI * 2;
          return entities.addVertex(
            new THREE.Vector3(centerVec.x + Math.cos(angle) * ringRadius, centerVec.y + Math.sin(angle) * ringRadius, centerVec.z + z),
          );
        });
      const outerBottom = ring(outerRadius, 0),
        outerTop = ring(outerRadius, heightValue),
        innerBottom = ring(innerRadius, 0),
        innerTop = ring(innerRadius, heightValue);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        entities.createFaceRaw([outerBottom[i], outerBottom[j], outerTop[j], outerTop[i]]); // outside
        entities.createFaceRaw([innerBottom[j], innerBottom[i], innerTop[i], innerTop[j]]); // inside
        entities.createFaceRaw([outerTop[i], outerTop[j], innerTop[j], innerTop[i]]); // top
        entities.createFaceRaw([outerBottom[i], innerBottom[i], innerBottom[j], outerBottom[j]]); // bottom
      }
      entities.mergeCoplanar([...entities.edges.keys()]);
      entities.autoSoften([...entities.edges.keys()], 35);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Torus (ring/donut) lying flat around `center`: R = ring radius, r = tube radius. */
  torus(
    center: Pt,
    majorRadius: number | string,
    minorRadius: number | string,
    opts: { segments?: number; sides?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center),
      majorValue = this.length(majorRadius),
      minorValue = this.length(minorRadius),
      segments = opts.segments ?? 24,
      sides = opts.sides ?? 12;
    return this.group(opts.name ?? 'Torus', () => {
      const entities = this.ents;
      const vertexAt = (i: number, k: number) => {
        const majorAngle = ((i % segments) / segments) * Math.PI * 2,
          minorAngle = ((k % sides) / sides) * Math.PI * 2,
          ringDistance = majorValue + minorValue * Math.cos(minorAngle);
        return entities.addVertex(
          new THREE.Vector3(
            centerVec.x + ringDistance * Math.cos(majorAngle),
            centerVec.y + ringDistance * Math.sin(majorAngle),
            centerVec.z + minorValue * Math.sin(minorAngle),
          ),
        );
      };
      for (let i = 0; i < segments; i++) {
        for (let k = 0; k < sides; k++) {
          entities.createFaceRaw([vertexAt(i, k), vertexAt(i + 1, k), vertexAt(i + 1, k + 1), vertexAt(i, k + 1)]);
        }
      }
      entities.autoSoften([...entities.edges.keys()], 45);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
}
