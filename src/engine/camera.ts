import * as THREE from 'three';
import type { CameraState } from '../core/document';

/** SketchUp-style camera: Z up, turntable orbit, zoom to cursor, perspective/parallel projection. */
export class CameraRig {
  persp = new THREE.PerspectiveCamera(35, 1, 0.01, 20000);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000);
  target = new THREE.Vector3(0, 0, 0);
  isOrtho = false;
  aspect = 1;
  private tween: { from: CameraState; to: CameraState; t0: number; dur: number } | null = null;
  onChange = () => {};

  constructor() {
    for (const c of [this.persp, this.ortho]) c.up.set(0, 0, 1);
    this.persp.position.set(-11, -17, 5.5);
    this.target.set(2, 2, 1.2);
    this.persp.lookAt(this.target);
    this.syncOrtho();
  }

  get camera(): THREE.Camera { return this.isOrtho ? this.ortho : this.persp; }
  get position() { return this.persp.position; }

  setAspect(a: number) { this.aspect = a; this.persp.aspect = a; this.persp.updateProjectionMatrix(); this.syncOrtho(); }

  /** Ortho camera mirrors the perspective camera, frustum sized by the target distance. */
  syncOrtho() {
    const d = this.persp.position.distanceTo(this.target);
    const h = d * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
    this.ortho.left = -h * this.aspect; this.ortho.right = h * this.aspect; this.ortho.top = h; this.ortho.bottom = -h;
    this.ortho.position.copy(this.persp.position);
    this.ortho.quaternion.copy(this.persp.quaternion);
    this.ortho.near = -d * 50; this.ortho.far = d * 50 + 10000;
    this.ortho.updateProjectionMatrix(); this.ortho.updateMatrixWorld();
    this.persp.updateMatrixWorld();
  }

  forward(): THREE.Vector3 { return this.target.clone().sub(this.persp.position).normalize(); }

  ray(ndc: THREE.Vector2): THREE.Ray {
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera); return rc.ray;
  }

  orbit(dx: number, dy: number, pivot?: THREE.Vector3) {
    const p = pivot ?? this.target;
    const yaw = -dx * 0.006, pitch = -dy * 0.006;
    const cam = this.persp;
    const off = cam.position.clone().sub(p);
    const toT = this.target.clone().sub(p);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
    off.applyQuaternion(qz); toT.applyQuaternion(qz);
    const fwd = this.target.clone().sub(cam.position).applyQuaternion(qz).normalize();
    const right = fwd.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
    // clamp pitch so we never flip over the pole
    const curPitch = Math.asin(THREE.MathUtils.clamp(fwd.z, -1, 1));
    const np = THREE.MathUtils.clamp(curPitch + pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    const qp = new THREE.Quaternion().setFromAxisAngle(right, np - curPitch);
    off.applyQuaternion(qp); toT.applyQuaternion(qp);
    cam.position.copy(p).add(off);
    this.target.copy(p).add(toT);
    cam.lookAt(this.target);
    this.changed();
  }

  /** Pan so that the world point under the cursor stays under the cursor. */
  pan(dxPx: number, dyPx: number, viewportH: number, depthPoint?: THREE.Vector3) {
    const cam = this.persp;
    const ref = depthPoint ?? this.target;
    let worldPerPx: number;
    if (this.isOrtho) worldPerPx = (this.ortho.top - this.ortho.bottom) / viewportH;
    else { const dist = ref.clone().sub(cam.position).dot(this.forward()); worldPerPx = 2 * Math.max(dist, 0.01) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / viewportH; }
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const move = right.multiplyScalar(-dxPx * worldPerPx).add(up.multiplyScalar(dyPx * worldPerPx));
    cam.position.add(move); this.target.add(move);
    this.changed();
  }

  /** Dolly towards a world point (zoom to cursor). factor < 1 zooms in. */
  zoomAt(point: THREE.Vector3 | null, factor: number) {
    const cam = this.persp;
    const p = point ?? this.target;
    const off = cam.position.clone().sub(p).multiplyScalar(factor);
    const newPos = p.clone().add(off);
    if (newPos.distanceTo(p) < 0.02 && factor < 1) return;
    const tOff = this.target.clone().sub(p).multiplyScalar(factor);
    cam.position.copy(newPos); this.target.copy(p).add(tOff);
    this.changed();
  }

  setFov(fov: number) { this.persp.fov = THREE.MathUtils.clamp(fov, 5, 120); this.persp.updateProjectionMatrix(); this.changed(); }

  zoomExtents(box: THREE.Box3, animate = true) {
    if (box.isEmpty()) box = new THREE.Box3(new THREE.Vector3(-2, -2, 0), new THREE.Vector3(2, 2, 2));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.1);
    const fov = THREE.MathUtils.degToRad(this.persp.fov);
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.aspect));
    const dist = r / Math.sin(fit / 2) * 1.05;
    const dir = this.persp.position.clone().sub(this.target).normalize();
    const to: CameraState = { pos: sphere.center.clone().addScaledVector(dir, dist).toArray(), target: sphere.center.toArray(), fov: this.persp.fov, ortho: this.isOrtho };
    this.applyState(to, animate);
  }

  standardView(name: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'iso', box: THREE.Box3) {
    const dirs: Record<string, number[]> = {
      top: [0, -0.0001, 1], bottom: [0, 0.0001, -1], front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], iso: [-1, -1, 0.8],
    };
    const d = new THREE.Vector3(...dirs[name]).normalize();
    const c = box.isEmpty() ? this.target.clone() : box.getCenter(new THREE.Vector3());
    const dist = this.persp.position.distanceTo(this.target);
    this.applyState({ pos: c.clone().addScaledVector(d, dist).toArray(), target: c.toArray(), fov: this.persp.fov, ortho: this.isOrtho }, true, () => this.zoomExtents(box, true));
  }

  getState(): CameraState { return { pos: this.persp.position.toArray(), target: this.target.toArray(), fov: this.persp.fov, ortho: this.isOrtho }; }

  private after: (() => void) | null = null;
  applyState(s: CameraState, animate = true, after?: () => void) {
    this.isOrtho = s.ortho;
    if (!animate) { this.tween = null; this.after = null; this.setState(s); after?.(); return; }
    this.tween = { from: this.getState(), to: s, t0: performance.now(), dur: 350 }; this.after = after ?? null;
  }
  private setState(s: CameraState) {
    this.persp.position.fromArray(s.pos); this.target.fromArray(s.target); this.persp.fov = s.fov;
    this.persp.updateProjectionMatrix(); this.persp.lookAt(this.target); this.changed();
  }
  update(): boolean {
    if (!this.tween) return false;
    const { from, to, t0, dur } = this.tween;
    let t = Math.min(1, (performance.now() - t0) / dur); const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lerp = (a: number[], b: number[]) => a.map((x, i) => x + (b[i] - x) * e);
    // interpolate in spherical coordinates around the target for nicer arcs
    const fT = new THREE.Vector3().fromArray(from.target), tT = new THREE.Vector3().fromArray(to.target);
    const fO = new THREE.Vector3().fromArray(from.pos).sub(fT), tO = new THREE.Vector3().fromArray(to.pos).sub(tT);
    const sf = new THREE.Spherical().setFromVector3(new THREE.Vector3(fO.x, fO.z, -fO.y)), st = new THREE.Spherical().setFromVector3(new THREE.Vector3(tO.x, tO.z, -tO.y));
    let dth = st.theta - sf.theta; if (dth > Math.PI) dth -= 2 * Math.PI; if (dth < -Math.PI) dth += 2 * Math.PI;
    const s = new THREE.Spherical(sf.radius + (st.radius - sf.radius) * e, sf.phi + (st.phi - sf.phi) * e, sf.theta + dth * e);
    const o = new THREE.Vector3().setFromSpherical(s);
    const target = new THREE.Vector3(...lerp(from.target, to.target));
    this.persp.position.copy(target).add(new THREE.Vector3(o.x, -o.z, o.y));
    this.target.copy(target); this.persp.fov = from.fov + (to.fov - from.fov) * e; this.persp.updateProjectionMatrix();
    this.persp.lookAt(this.target);
    if (t >= 1) { this.tween = null; this.setState(to); const a = this.after; this.after = null; a?.(); }
    this.changed();
    return true;
  }

  private changed() { this.syncOrtho(); this.onChange(); }
}
