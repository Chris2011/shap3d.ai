import type { Definition } from '../../../src/core/model';
import type { Model } from '../../../src/core/document';
import { THREE } from './runtime';

export const IFC_PLUGIN = 'ifc';

/** a property or quantity value with its STEP type, e.g. { value: 0.24, type: 'IFCLENGTHMEASURE' } */
export interface IfcValue {
  value: string | number | boolean | null;
  type: string;
}

/** property sets (or quantity sets) by name, each with its values by property name */
export type IfcPropertySets = Record<string, Record<string, IfcValue>>;

/**
 * What the plugin keeps on a group/component (`pluginData.ifc`): the IFC class and the data an
 * IFC export needs to write it back – saved with the model, kept while the plugin is off.
 */
export interface IfcData {
  /** IFC entity, e.g. "IfcWall", "IfcBuildingStorey" */
  class: string;
  /** IFC GlobalId (22 characters) – kept from the import so a round trip keeps the identity */
  guid?: string;
  predefinedType?: string;
  objectType?: string;
  description?: string;
  longName?: string;
  /** name of the IFC material (IfcMaterial, layer set …) */
  material?: string;
  properties?: IfcPropertySets;
  quantities?: IfcPropertySets;
}

/** The spatial structure: these become nested containers, everything else is an element. */
export const SPATIAL_CLASSES = ['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcSpace'];

export const isSpatial = (ifcClass: string | undefined) => !!ifcClass && SPATIAL_CLASSES.includes(ifcClass);

/** The IFC data on a group/component, or undefined. */
export const ifcOf = (definition: Definition): IfcData | undefined => {
  const data = definition.pluginData?.[IFC_PLUGIN] as IfcData | undefined;
  return data?.class ? data : undefined;
};

/** Stores (or with undefined removes) the IFC data of a group/component. Call it inside editor.commit for undo. */
export const setIfc = (definition: Definition, data: IfcData | undefined) => {
  const pluginData = { ...definition.pluginData };
  if (data) {
    pluginData[IFC_PLUGIN] = data;
  } else {
    delete pluginData[IFC_PLUGIN];
  }
  definition.pluginData = Object.keys(pluginData).length ? pluginData : undefined;
};

/** Tags hidden right after an import – spaces and zones are volumes that would hide the building. */
const HIDDEN_TAGS = ['IfcSpace', 'IfcSpatialZone', 'IfcOpeningElement', 'IfcAnnotation'];

/** Makes sure the model has a tag for this IFC class (SketchUp also files IFC classes as tags); returns its name. */
export const ensureClassTag = (model: Model, ifcClass: string) => {
  if (!model.tags.some((tag) => tag.name === ifcClass)) {
    // a stable colour per class name
    let hash = 0;
    for (const character of ifcClass) {
      hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    const color = '#' + new THREE.Color().setHSL((Math.abs(hash) % 360) / 360, 0.45, 0.55).getHexString();
    model.tags.push({ name: ifcClass, visible: !HIDDEN_TAGS.includes(ifcClass), color });
  }
  return ifcClass;
};

const GUID_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** A new IFC GlobalId: 128 random bits in IFC's 22-character base-64 form. */
export const newGuid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let number = BigInt('0x' + [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
  let guid = '';
  for (let i = 0; i < 22; i++) {
    guid = GUID_CHARACTERS[Number(number & 63n)] + guid;
    number >>= 6n;
  }
  return guid;
};

export const isGuid = (text: string | undefined): text is string => !!text && /^[0-3][0-9A-Za-z_$]{21}$/.test(text);
