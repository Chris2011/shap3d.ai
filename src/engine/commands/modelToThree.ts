import * as THREE from 'three';
import type { Editor } from '../editor';
import type { Entities } from '../../core/model';
import { textureTile, tileUv } from '../../core/textures';
import { planeBasis } from '../../core/geometry';
import { materialShader, bakeSurface, type BakeFace } from '../surfaceShaders';

/** Build a plain three.js scene of the model (for exporters). Textures come along with texture coordinates, shader materials baked into pictures. */
export const modelToThree = (editor: Editor): THREE.Group => {
  const root = new THREE.Group();
  root.name = editor.model.name;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const makeMat = (name: string | undefined, fallback: string, map?: THREE.Texture) => {
    const material = editor.model.material(name);
    const made = new THREE.MeshStandardMaterial({
      // a texture already carries the colour
      color: map ? '#ffffff' : (material?.color ?? fallback),
      map: map ?? null,
      transparent: (material?.opacity ?? 1) < 1,
      opacity: material?.opacity ?? 1,
      side: THREE.DoubleSide,
      // shortcut: values only, the pictures of physically based materials are not exported; add them with their UVs when needed
      roughness: material?.roughness ?? 0.8,
      metalness: material?.metalness ?? 0,
    });
    made.name = name ?? 'Standard';
    return made;
  };
  const getMat = (name: string | undefined, fallback: string, map?: THREE.Texture) => {
    const key = name ?? '__default';
    let cached = mats.get(key);
    if (!cached) {
      cached = makeMat(name, fallback, map);
      mats.set(key, cached);
    }
    return cached;
  };
  // a definition placed many times is baked once
  const baked = new Map<Entities, Map<string, { material: THREE.MeshStandardMaterial; uvs: number[] } | null>>();
  const hidden = editor.model.hiddenTags();
  const frontColor = editor.model.settings.style.frontColor;
  const build = (ents: Entities, parent: THREE.Object3D, inherit?: string) => {
    const byMat = new Map<string, BakeFace[]>();
    for (const face of ents.faces.values()) {
      if (face.hidden || (face.tag && hidden.has(face.tag))) {
        continue;
      }
      const key = face.material ?? inherit ?? '__default';
      const tri = ents.faceTriangles(face);
      const pts = [...face.outer, ...face.holes.flat()].map((vertex) => ents.positionOf(vertex));
      const faces = byMat.get(key) ?? [];
      faces.push({ points: tri.map((i) => pts[i]), normal: ents.faceNormal(face) });
      byMat.set(key, faces);
    }
    for (const [materialKey, faces] of byMat) {
      const name = materialKey === '__default' ? undefined : materialKey;
      const definition = editor.model.material(name);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          faces.flatMap((face) => face.points.flatMap((point) => [point.x, point.y, point.z])),
          3,
        ),
      );
      geometry.computeVertexNormals();
      let material: THREE.MeshStandardMaterial | undefined;
      const shader = materialShader(definition);
      const tile = shader ? undefined : textureTile(definition);
      if (shader && definition) {
        let perLevel = baked.get(ents);
        if (!perLevel) {
          perLevel = new Map();
          baked.set(ents, perLevel);
        }
        if (!perLevel.has(materialKey)) {
          const surface = bakeSurface(shader, definition, faces);
          perLevel.set(materialKey, surface && { material: makeMat(name, frontColor, surface.texture), uvs: surface.uvs });
        }
        const surface = perLevel.get(materialKey);
        if (surface) {
          material = surface.material;
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uvs, 2));
        }
      } else if (tile) {
        material = getMat(name, frontColor, tile.map);
        const uvs: number[] = [];
        for (const face of faces) {
          const { basisU, basisV } = planeBasis(face.normal);
          for (const point of face.points) {
            uvs.push(...tileUv(tile, point, basisU, basisV));
          }
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      }
      parent.add(new THREE.Mesh(geometry, material ?? getMat(name, frontColor)));
    }
    for (const instance of ents.instances.values()) {
      if (instance.hidden || (instance.tag && hidden.has(instance.tag))) {
        continue;
      }
      const group = new THREE.Group();
      group.name = instance.name || instance.definition.name;
      group.matrixAutoUpdate = false;
      group.matrix.copy(instance.matrix);
      instance.matrix.decompose(group.position, group.quaternion, group.scale);
      group.matrixAutoUpdate = true;
      parent.add(group);
      build(instance.definition.entities, group, instance.material ?? inherit);
    }
  };
  build(editor.model.root, root);
  // SketchUp is Z-up; most formats expect Y-up
  const yup = new THREE.Group();
  yup.rotation.x = -Math.PI / 2;
  yup.add(root);
  const wrap = new THREE.Group();
  wrap.add(yup);
  wrap.updateMatrixWorld(true);
  return wrap;
};
