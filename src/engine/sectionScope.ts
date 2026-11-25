// Which planes the active section cuts make and which groups they cut – a cut can be limited to tags and a view depth.
import * as THREE from 'three';
import type { SectionPlane } from '../core/document';
import type { Instance } from '../core/model';

export interface SectionScope {
  /** the cut planes – they get a fill */
  cuts: THREE.Plane[];
  /** all planes: the cuts and the back planes of a view depth */
  planes: THREE.Plane[];
  /** only groups and components with one of these tags are cut; null = everything */
  tags: Set<string> | null;
}

/** shortcut: the tags of all active sections together limit all of their planes – fine while one section is active at a time */
export const sectionScope = (sections: SectionPlane[], on: boolean): SectionScope => {
  const scope: SectionScope = { cuts: [], planes: [], tags: null };
  const active = on ? sections.filter((section) => section.active) : [];
  for (const section of active) {
    const normal = section.normal.clone().normalize();
    const cut = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, section.point);
    scope.cuts.push(cut);
    scope.planes.push(cut);
    if (section.depth && section.depth > 0) {
      const back = section.point.clone().addScaledVector(normal, section.depth);
      scope.planes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone().negate(), back));
    }
  }
  if (active.length && active.every((section) => section.tags?.length)) {
    scope.tags = new Set(active.flatMap((section) => section.tags!));
  }
  return scope;
};

/** whether the section cuts a group with these instances above it – with no tag on the way it counts as 'Untagged' */
export const cutsPath = (scope: SectionScope, path: Instance[]) => {
  if (!scope.tags) {
    return true;
  }
  const tags = path.map((instance) => instance.tag).filter((tag) => !!tag);
  return tags.length ? tags.some((tag) => scope.tags!.has(tag!)) : scope.tags.has('Untagged');
};
