import type { Vector3 } from 'three';
import type { Editor } from '../../../src/engine/editor';
import type { Definition } from '../../../src/core/model';
import { pluginContext, t, THREE } from './runtime';
import { ensureClassTag, isSpatial, setIfc } from './ifcData';
import type { ProductNode } from './ifcRead';
// oxlint-disable-next-line import/default -- made by the build
import IfcWorker from './ifcWorker.ts?worker&inline';
import type { IfcWorkerAnswer, IfcWorkerRequest } from './ifcWorker';

/**
 * IFC to model: the file is read in a worker (ifcRead.ts) and the faces are made in another; this module
 * turns that into nested groups – the spatial structure (project › site › building › storey) and one
 * group per element, with its IFC class as tag and its GlobalId, attributes and property sets kept
 * on the group. web-ifc itself is only loaded while an IFC file is read.
 */

/** reads a file in a worker that is gone afterwards, with web-ifc and all its memory */
const readInWorker = async (file: File) => {
  const assets = pluginContext().assets;
  const fileData = new Uint8Array(await file.arrayBuffer());
  const worker = new IfcWorker();
  try {
    const answer = await new Promise<IfcWorkerAnswer>((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = (event) => resolve(event.data);
      const request: IfcWorkerRequest = { urls: { api: assets.url('web-ifc-api.js'), wasm: assets.url('web-ifc.wasm') }, fileData };
      worker.postMessage(request, [fileData.buffer]);
    });
    if (!answer.ok) {
      throw new Error(answer.error.startsWith('ifc.errors.') ? t(answer.error) : answer.error);
    }
    return answer.result;
  } finally {
    worker.terminate();
  }
};

/** Imports an .ifc file as nested groups – one undo step, placed on the ground at the origin. */
export const importIfc = async (file: File, editor: Editor) => {
  const meshes = pluginContext().meshes;
  const { project, schema, triangles, skipped } = await readInWorker(file);
  const model = editor.model;
  let elements = 0;
  const classes = new Set<string>();

  // one model material per colour, named after the IFC material (or the class)
  const materialNames = new Map<string, string>();
  /** added in the undo step of the import */
  const newMaterials: { name: string; color: string; opacity: number }[] = [];
  const materialFor = (key: string, base: string) => {
    const known = materialNames.get(key);
    if (known) {
      return known;
    }
    const [color, opacityText] = key.split('|');
    const opacity = THREE.MathUtils.clamp(Number(opacityText), 0.05, 1);
    let name = base,
      counter = 2;
    // reuse a material only when it looks the same
    while (
      model.materials.some(
        (material) => material.name === name && (material.color !== color || Math.abs(material.opacity - opacity) > 0.01),
      )
    ) {
      name = `${base} ${counter++}`;
    }
    if (!model.materials.some((material) => material.name === name) && !newMaterials.some((material) => material.name === name)) {
      newMaterials.push({ name, color, opacity });
    }
    materialNames.set(key, name);
    return name;
  };

  // the faces of all elements, made in a worker: elements get their origin at the bottom centre of their geometry
  const pivots = new Map<ProductNode, Vector3>();
  const withMesh: ProductNode[] = [];
  const collect = (node: ProductNode) => {
    if (node.mesh) {
      withMesh.push(node);
    }
    node.children.forEach(collect);
  };
  collect(project);
  const list = withMesh.map((node) => {
    const mesh = node.mesh!;
    const pivot = new THREE.Vector3();
    if (!isSpatial(node.data.class)) {
      const box = new THREE.Box3().setFromPoints(mesh.vertices.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      pivot.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);
    }
    pivots.set(node, pivot);
    const base = node.data.material ?? node.data.class;
    return {
      mesh: {
        vertices: mesh.vertices.map(([x, y, z]): [number, number, number] => [x - pivot.x, y - pivot.y, z - pivot.z]),
        faces: mesh.faces,
        faceMaterials: mesh.colors.map((color) => materialFor(color, base)),
      },
      options: { smooth: 25 },
    };
  });
  const prepared = await (meshes.prepareAll?.(list) ?? list.map((item) => item.mesh));
  const facesOf = new Map(withMesh.map((node, index) => [node, prepared[index]]));

  /** builds a node into a new group */
  const build = (node: ProductNode): { definition: Definition; pivot: Vector3 } => {
    const definition = model.newDefinition(model.uniqueDefName(node.name), false);
    const entities = definition.entities;
    const pivot = pivots.get(node) ?? new THREE.Vector3();
    const faces = facesOf.get(node);
    if (faces) {
      meshes.build(entities, faces, { smooth: 25 });
      elements++;
    }
    for (const child of node.children) {
      const built = build(child);
      const offset = built.pivot.clone().sub(pivot);
      const instance = entities.addInstance(
        built.definition,
        new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z),
        child.name,
      );
      instance.tag = ensureClassTag(model, child.data.class);
      classes.add(child.data.class);
    }
    setIfc(definition, node.data);
    return { definition, pivot };
  };

  editor.commit('undo.import', () => {
    model.materials.push(...newMaterials);
    const { definition } = build(project);
    // on the ground, centred on the origin – like every other import
    const box = definition.entities.bounds();
    if (box.isEmpty()) {
      throw new Error(t('ifc.errors.noGeometry'));
    }
    const shift = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
    const instance = editor.entities.addInstance(definition, shift, project.name);
    instance.tag = ensureClassTag(model, 'IfcProject');
    editor.select([{ kind: 'instance', id: instance.id }]);
  });
  editor.toast(
    t('ifc.imported', { file: file.name, schema, elements, classes: classes.size, triangles }) +
      (skipped ? ` – ${t('import.skipped', { count: skipped })}` : ''),
  );
  editor.zoomExtents();
};
