import * as THREE from 'three';
import type { CameraState } from '../core/document';

/** SketchUp-style camera: Z up, turntable orbit, zoom to cursor, perspective/parallel projection. */
export class CameraRig {
  persp = new THREE.PerspectiveCamera(35, 1, 0.01, 20000);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000);
  target = new THREE.Vector3(0, 0, 0);
  isOrtho = false;
  aspect = 1;
  private tween: { from: CameraState; to: CameraState; startedAt: number; duration: number } | null = null;
  onChange = () => {};

  constructor() {
    for (const camera of [this.persp, this.ortho]) {
      camera.up.set(0, 0, 1);
    }
    this.persp.position.set(-11, -17, 5.5);
    this.target.set(2, 2, 1.2);
    this.persp.lookAt(this.target);
    this.syncOrtho();
  }

  get camera(): THREE.Camera {
    return this.isOrtho ? this.ortho : this.persp;
  }
  get position() {
    return this.persp.position;
  }

  setAspect(aspect: number) {
    this.aspect = aspect;
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.syncOrtho();
  }

  /** Ortho camera mirrors the perspective camera, frustum sized by the target distance. */
  syncOrtho() {
    const distance = this.persp.position.distanceTo(this.target);
    const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
    this.ortho.left = -halfHeight * this.aspect;
    this.ortho.right = halfHeight * this.aspect;
    this.ortho.top = halfHeight;
    this.ortho.bottom = -halfHeight;
    this.ortho.position.copy(this.persp.position);
    this.ortho.quaternion.copy(this.persp.quaternion);
    this.ortho.near = -distance * 50;
    this.ortho.far = distance * 50 + 10000;
    this.ortho.updateProjectionMatrix();
    this.ortho.updateMatrixWorld();
    this.persp.updateMatrixWorld();
  }

  forward(): THREE.Vector3 {
    return this.target.clone().sub(this.persp.position).normalize();
  }

  ray(ndc: THREE.Vector2): THREE.Ray {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    return raycaster.ray;
  }

  orbit(deltaX: number, deltaY: number, pivot?: THREE.Vector3) {
    const center = pivot ?? this.target;
    const yaw = -deltaX * 0.006,
      pitch = -deltaY * 0.006;
    const cam = this.persp;
    const off = cam.position.clone().sub(center);
    const toT = this.target.clone().sub(center);
    const yawRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
    off.applyQuaternion(yawRotation);
    toT.applyQuaternion(yawRotation);
    const fwd = this.target.clone().sub(cam.position).applyQuaternion(yawRotation).normalize();
    const right = fwd
      .clone()
      .cross(new THREE.Vector3(0, 0, 1))
      .normalize();
    // clamp pitch so we never flip over the pole
    const curPitch = Math.asin(THREE.MathUtils.clamp(fwd.z, -1, 1));
    const newPitch = THREE.MathUtils.clamp(curPitch + pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    const rotation = new THREE.Quaternion().setFromAxisAngle(right, newPitch - curPitch);
    off.applyQuaternion(rotation);
    toT.applyQuaternion(rotation);
    cam.position.copy(center).add(off);
    this.target.copy(center).add(toT);
    cam.lookAt(this.target);
    this.changed();
  }

  /** Pan so that the world point under the cursor stays under the cursor. */
  pan(dxPx: number, dyPx: number, viewportH: number, depthPoint?: THREE.Vector3) {
    const cam = this.persp;
    const ref = depthPoint ?? this.target;
    let worldPerPx: number;
    if (this.isOrtho) {
      worldPerPx = (this.ortho.top - this.ortho.bottom) / viewportH;
    } else {
      const dist = ref.clone().sub(cam.position).dot(this.forward());
      worldPerPx = (2 * Math.max(dist, 0.01) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / viewportH;
    }
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const move = right.multiplyScalar(-dxPx * worldPerPx).add(up.multiplyScalar(dyPx * worldPerPx));
    cam.position.add(move);
    this.target.add(move);
    this.changed();
  }

  /** Dolly towards a world point (zoom to cursor). factor < 1 zooms in. */
  zoomAt(point: THREE.Vector3 | null, factor: number) {
    const cam = this.persp;
    const center = point ?? this.target;
    const off = cam.position.clone().sub(center).multiplyScalar(factor);
    const newPos = center.clone().add(off);
    if (newPos.distanceTo(center) < 0.02 && factor < 1) {
      return;
    }
    const tOff = this.target.clone().sub(center).multiplyScalar(factor);
    cam.position.copy(newPos);
    this.target.copy(center).add(tOff);
    this.changed();
  }

  setFov(fov: number) {
    this.persp.fov = THREE.MathUtils.clamp(fov, 5, 120);
    this.persp.updateProjectionMatrix();
    this.changed();
  }

  zoomExtents(box: THREE.Box3, animate = true) {
    if (box.isEmpty()) {
      box = new THREE.Box3(new THREE.Vector3(-2, -2, 0), new THREE.Vector3(2, 2, 2));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.1);
    const fov = THREE.MathUtils.degToRad(this.persp.fov);
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.aspect));
    const dist = (radius / Math.sin(fit / 2)) * 1.05;
    const dir = this.persp.position.clone().sub(this.target).normalize();
    const to: CameraState = {
      position: sphere.center.clone().addScaledVector(dir, dist).toArray(),
      target: sphere.center.toArray(),
      fov: this.persp.fov,
      ortho: this.isOrtho,
    };
    this.applyState(to, animate);
  }

  standardView(name: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'iso', box: THREE.Box3, animate = true) {
    const dirs: Record<string, number[]> = {
      top: [0, -0.0001, 1],
      bottom: [0, 0.0001, -1],
      front: [0, -1, 0],
      back: [0, 1, 0],
      left: [-1, 0, 0],
      right: [1, 0, 0],
      iso: [-1, -1, 0.8],
    };
    const direction = new THREE.Vector3(...dirs[name]).normalize();
    const center = box.isEmpty() ? this.target.clone() : box.getCenter(new THREE.Vector3());
    const dist = this.persp.position.distanceTo(this.target);
    this.applyState(
      {
        position: center.clone().addScaledVector(direction, dist).toArray(),
        target: center.toArray(),
        fov: this.persp.fov,
        ortho: this.isOrtho,
      },
      animate,
      () => this.zoomExtents(box, animate),
    );
  }

  getState(): CameraState {
    return { position: this.persp.position.toArray(), target: this.target.toArray(), fov: this.persp.fov, ortho: this.isOrtho };
  }

  private after: (() => void) | null = null;
  applyState(state: CameraState, animate = true, after?: () => void) {
    this.isOrtho = state.ortho;
    if (!animate) {
      this.tween = null;
      this.after = null;
      this.setState(state);
      after?.();
      return;
    }
    this.tween = { from: this.getState(), to: state, startedAt: performance.now(), duration: 350 };
    this.after = after ?? null;
  }
  private setState(state: CameraState) {
    this.persp.position.fromArray(state.position);
    this.target.fromArray(state.target);
    this.persp.fov = state.fov;
    this.persp.updateProjectionMatrix();
    this.persp.lookAt(this.target);
    this.changed();
  }
  update(): boolean {
    if (!this.tween) {
      return false;
    }
    const { from, to, startedAt, duration: dur } = this.tween;
    const progress = Math.min(1, (performance.now() - startedAt) / dur);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const lerp = (fromValues: number[], toValues: number[]) => fromValues.map((x, i) => x + (toValues[i] - x) * eased);
    // interpolate in spherical coordinates around the target for nicer arcs
    const fromTarget = new THREE.Vector3().fromArray(from.target),
      toTarget = new THREE.Vector3().fromArray(to.target);
    const fromOffset = new THREE.Vector3().fromArray(from.position).sub(fromTarget),
      toOffset = new THREE.Vector3().fromArray(to.position).sub(toTarget);
    const fromSpherical = new THREE.Spherical().setFromVector3(new THREE.Vector3(fromOffset.x, fromOffset.z, -fromOffset.y)),
      toSpherical = new THREE.Spherical().setFromVector3(new THREE.Vector3(toOffset.x, toOffset.z, -toOffset.y));
    let dth = toSpherical.theta - fromSpherical.theta;
    if (dth > Math.PI) {
      dth -= 2 * Math.PI;
    }
    if (dth < -Math.PI) {
      dth += 2 * Math.PI;
    }
    const spherical = new THREE.Spherical(
      fromSpherical.radius + (toSpherical.radius - fromSpherical.radius) * eased,
      fromSpherical.phi + (toSpherical.phi - fromSpherical.phi) * eased,
      fromSpherical.theta + dth * eased,
    );
    const offset = new THREE.Vector3().setFromSpherical(spherical);
    const target = new THREE.Vector3(...lerp(from.target, to.target));
    this.persp.position.copy(target).add(new THREE.Vector3(offset.x, -offset.z, offset.y));
    this.target.copy(target);
    this.persp.fov = from.fov + (to.fov - from.fov) * eased;
    this.persp.updateProjectionMatrix();
    this.persp.lookAt(this.target);
    if (progress >= 1) {
      this.tween = null;
      this.setState(to);
      const callback = this.after;
      this.after = null;
      callback?.();
    }
    this.changed();
    return true;
  }

  private changed() {
    this.syncOrtho();
    this.onChange();
  }
}
