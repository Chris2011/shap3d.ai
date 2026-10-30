import * as THREE from 'three';

/**
 * Lights and atmosphere that plugins bring into the 3D view (a level's lamps, a torch, fog, darkness). While any are
 * set, the view draws its faces with lit materials, so the lights fall on them; the model itself is not changed.
 */

/** a light a plugin puts into the view – metres, Z up */
export interface PluginLight {
  kind: 'point' | 'spot';
  position: [number, number, number];
  /** a spot's direction (it shines along it) */
  direction?: [number, number, number];
  /** CSS colour */
  color?: string;
  /** brightness: 1 is a bright lamp a few metres away (default 1) */
  intensity?: number;
  /** how far it reaches (m, default 10) */
  range?: number;
  /** a spot's cone (degrees from its axis, default 30) and how soft its edge is (0 … 1, default 0.3) */
  angle?: number;
  penumbra?: number;
  /**
   * casts shadows (the first four lights that ask for it – more would slow every frame); things closer to the light
   * than half a metre cast none, so its own lamp does not darken the room
   */
  shadow?: boolean;
}

/** fog, how much daylight is left and the background behind everything */
export interface PluginAtmosphere {
  fog?: { color: string; near: number; far: number };
  /** 0 … 1: the model's ambient light and sun (1 = as without atmosphere, 0 = only the plugins' lights) */
  daylight?: number;
  /** CSS colour behind the model – default the fog's colour, else the style's sky */
  background?: string;
}

/** three.js wants candela: this turns "1 = a bright lamp" into it */
const CANDELA = 30;
/** how many plugin lights cast shadows at most (a point light renders its shadow six times) */
const MAX_SHADOWS = 4;

export class PluginLighting {
  group = new THREE.Group();
  private sets = new Map<string, THREE.Light[]>();
  atmosphere: PluginAtmosphere | null = null;
  private atmosphereOwner: string | null = null;

  /** are the faces to be drawn lit (lights or an atmosphere set)? */
  active() {
    return !!this.atmosphere || [...this.sets.values()].some((lights) => lights.length > 0);
  }

  /** does any light cast shadows (the view needs its shadow map then)? */
  casts() {
    return [...this.sets.values()].some((lights) => lights.some((light) => light.castShadow));
  }

  /**
   * Sets a plugin's lights. Lights of the same kind in the same order are moved and changed in place – a torch that
   * follows the camera costs nothing then; only a different number or kind builds them again.
   */
  setLights(owner: string, lights: PluginLight[]) {
    const old = this.sets.get(owner) ?? [];
    const same =
      old.length === lights.length && old.every((light, index) => light instanceof THREE.SpotLight === (lights[index].kind === 'spot'));
    const made = same
      ? old
      : lights.map((light) => {
          const created = light.kind === 'spot' ? new THREE.SpotLight() : new THREE.PointLight();
          if (created instanceof THREE.SpotLight) {
            this.group.add(created.target);
          }
          this.group.add(created);
          return created;
        });
    if (!same) {
      for (const light of old) {
        this.group.remove(light);
        if (light instanceof THREE.SpotLight) {
          this.group.remove(light.target);
        }
        light.dispose();
      }
    }
    lights.forEach((light, index) => {
      const target = made[index] as THREE.PointLight | THREE.SpotLight;
      target.position.set(...light.position);
      target.color.set(light.color ?? '#ffffff');
      target.intensity = (light.intensity ?? 1) * CANDELA;
      target.distance = light.range ?? 10;
      target.decay = 2;
      if (target instanceof THREE.SpotLight) {
        const [dx, dy, dz] = light.direction ?? [0, 0, -1];
        target.target.position.set(light.position[0] + dx, light.position[1] + dy, light.position[2] + dz);
        target.angle = THREE.MathUtils.degToRad(Math.min(89, Math.max(1, light.angle ?? 30)));
        target.penumbra = Math.min(1, Math.max(0, light.penumbra ?? 0.3));
        target.target.updateMatrixWorld();
      }
      const others = [...this.sets.entries()]
        .filter(([name]) => name !== owner)
        .reduce((count, [, set]) => count + set.filter((other) => other.castShadow).length, 0);
      const before = lights.slice(0, index).filter((other) => other.shadow).length;
      target.castShadow = !!light.shadow && others + before < MAX_SHADOWS;
      if (target.castShadow) {
        const size = target instanceof THREE.SpotLight ? 1024 : 512;
        if (target.shadow.mapSize.x !== size) {
          target.shadow.mapSize.set(size, size);
          target.shadow.map?.dispose();
          target.shadow.map = null;
        }
        target.shadow.bias = -0.0005;
        target.shadow.normalBias = 0.02;
        target.shadow.camera.near = 0.5;
        target.shadow.camera.far = Math.max(1, target.distance);
        target.shadow.camera.updateProjectionMatrix();
      }
      target.updateMatrixWorld();
    });
    if (made.length) {
      this.sets.set(owner, made);
    } else {
      this.sets.delete(owner);
    }
  }

  setAtmosphere(owner: string, atmosphere: PluginAtmosphere | null) {
    if (!atmosphere && this.atmosphereOwner !== owner) {
      return;
    }
    this.atmosphere = atmosphere ? { ...atmosphere } : null;
    this.atmosphereOwner = atmosphere ? owner : null;
  }

  /** the fog for the scene, or null */
  fog() {
    const fog = this.atmosphere?.fog;
    return fog ? new THREE.Fog(fog.color, Math.max(0, fog.near), Math.max(fog.near + 0.1, fog.far)) : null;
  }

  /** the background colour while an atmosphere is set, or null for the style's sky */
  background() {
    return this.atmosphere?.background ?? this.atmosphere?.fog?.color ?? null;
  }

  daylight() {
    return Math.min(1, Math.max(0, this.atmosphere?.daylight ?? 1));
  }
}
