import * as THREE from 'three';
import type { Editor } from './editor';
import { formatVolume } from '../core/units';
import { isSolid, volume } from '../core/solids';
import { t } from '../i18n';

interface PaintedInfo {
  title: string;
  material?: string;
  /** CSS colour of the material swatch */
  matColor: string;
  hidden: boolean;
}
export interface FaceInfo extends PaintedInfo {
  kind: 'face';
  back?: string;
  backColor: string;
  tag?: string;
  area: string;
}
export interface EdgeInfo {
  kind: 'edge';
  title: string;
  tag?: string;
  hidden: boolean;
  soft: boolean;
  length: string;
}
export interface InstanceInfo extends PaintedInfo {
  kind: 'instance';
  name?: string;
  defName: string;
  attributes: Record<string, string>;
  isComponent: boolean;
  /** copies of the definition in the model */
  count: number;
  tag?: string;
  locked: boolean;
  /** position in metres */
  pos: [number, number, number];
  size: string;
  /** '' unless it is a solid */
  volume: string;
}
export interface MultiInfo extends PaintedInfo {
  kind: 'multi';
  tag?: undefined;
  area: string;
  length: string;
}
export type SelectionInfo = { kind: 'none' } | FaceInfo | EdgeInfo | InstanceInfo | MultiInfo;

/** What Entity Info shows about the selection: one face, edge or group/component, several elements, or nothing. */
export const describeSelection = (editor: Editor): SelectionInfo => {
  const selection = editor.selected();
  const entities = editor.entities;
  const style = editor.model.settings.style;
  const colorOf = (materialName: string | undefined, fallback: string) => editor.model.material(materialName)?.color ?? fallback;
  if (!selection.length) {
    return { kind: 'none' };
  }
  if (selection.length === 1) {
    const single = selection[0];
    if (single.kind === 'face') {
      const face = entities.faces.get(single.id)!;
      return {
        kind: 'face',
        title: t('entityInfo.face'),
        material: face.material,
        matColor: colorOf(face.material, style.frontColor),
        back: face.backMaterial,
        backColor: colorOf(face.backMaterial, style.backColor),
        tag: face.tag,
        hidden: !!face.hidden,
        area: editor.fmtArea(entities.faceArea(face)),
      };
    }
    if (single.kind === 'edge') {
      const edge = entities.edges.get(single.id)!;
      return {
        kind: 'edge',
        title: t('entityInfo.edge'),
        tag: edge.tag,
        hidden: !!edge.hidden,
        soft: !!edge.soft,
        length: editor.fmt(entities.edgeLength(edge)),
      };
    }
    const instance = entities.instances.get(single.id)!;
    const pos = new THREE.Vector3().setFromMatrixPosition(instance.matrix);
    const bounds = instance.definition.entities.bounds(new THREE.Box3(), instance.matrix.clone());
    const size = bounds.getSize(new THREE.Vector3());
    let count = 0;
    const walk = (container: typeof entities) => {
      for (const child of container.instances.values()) {
        if (child.definition === instance.definition) {
          count++;
        }
        walk(child.definition.entities);
      }
    };
    walk(editor.model.root);
    const solid = isSolid(instance.definition.entities);
    const cubicMeters = solid ? Math.abs(volume(instance.definition.entities, instance.matrix)) : 0;
    const isComponent = instance.definition.isComponent;
    return {
      kind: 'instance',
      volume: solid ? formatVolume(cubicMeters, editor.model.settings.units) : '',
      title: t(
        solid ? (isComponent ? 'entityInfo.solidComponent' : 'entityInfo.solidGroup') : isComponent ? 'names.component' : 'names.group',
      ),
      name: instance.name,
      defName: instance.definition.name,
      attributes: instance.definition.attributes ?? {},
      isComponent,
      count,
      material: instance.material,
      matColor: colorOf(instance.material, '#ffffff'),
      tag: instance.tag,
      hidden: !!instance.hidden,
      locked: !!instance.locked,
      pos: [pos.x, pos.y, pos.z],
      size: `${editor.fmt(size.x)} × ${editor.fmt(size.y)} × ${editor.fmt(size.z)}`,
    };
  }
  let area = 0;
  let length = 0;
  for (const entityRef of selection) {
    if (entityRef.kind === 'face') {
      area += entities.faceArea(entities.faces.get(entityRef.id)!);
    }
    if (entityRef.kind === 'edge') {
      length += entities.edgeLength(entities.edges.get(entityRef.id)!);
    }
  }
  const first = selection.find((entityRef) => entityRef.kind === 'face');
  const firstMaterial = first ? entities.faces.get(first.id)!.material : undefined;
  return {
    kind: 'multi',
    title: t('entityInfo.elements', { count: selection.length, summary: editor.selectionSummary() }),
    material: firstMaterial,
    matColor: colorOf(firstMaterial, style.frontColor),
    hidden: false,
    area: area ? editor.fmtArea(area) : '',
    length: length ? editor.fmt(length) : '',
  };
};
