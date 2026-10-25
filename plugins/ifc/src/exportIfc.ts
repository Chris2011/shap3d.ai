import type { Matrix4, Vector3 } from 'three';
import type { Editor } from '../../../src/engine/editor';
import type { Definition, Entities } from '../../../src/core/model';
import { exportClass } from './ifcClasses';
import { ifcOf, isGuid, isSpatial, newGuid, type IfcData, type IfcPropertySets, type IfcValue } from './ifcData';
import { THREE } from './runtime';

/**
 * The IFC4 writer: walks the model and writes a STEP file (ISO 10303-21) by hand – no WebAssembly
 * needed. Groups with an IFC class keep it (and their GlobalId and property sets); the spatial
 * structure comes from groups classified as site, building, storey or space, and whatever is
 * outside of it lands in a default storey. Geometry is written as triangulated face sets in world
 * coordinates (metres, Z up), with a surface style and an IfcMaterial per model material.
 */

// ------------------------------------------------------------ STEP values
const QUOTE = "'";

/** a STEP string: quotes doubled, backslashes doubled, everything outside ASCII as \X2\…\X0\ */
const stepString = (value: string | undefined) => {
  if (value == null) {
    return '$';
  }
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (character === QUOTE) {
      result += "''";
    } else if (character === '\\') {
      result += '\\\\';
    } else if (code >= 32 && code < 127) {
      result += character;
    } else {
      const units = code > 0xffff ? [Math.floor((code - 0x10000) / 0x400) + 0xd800, ((code - 0x10000) % 0x400) + 0xdc00] : [code];
      result += '\\X2\\' + units.map((unit) => unit.toString(16).toUpperCase().padStart(4, '0')).join('') + '\\X0\\';
    }
  }
  return `${QUOTE}${result}${QUOTE}`;
};

/** a STEP real – always with a decimal point ("1.", "1.5E-05") */
const stepReal = (value: number) => {
  const rounded = Math.abs(value) < 1e-12 ? 0 : value;
  const [mantissa, exponent] = String(Number(rounded.toPrecision(12)))
    .toUpperCase()
    .split('E');
  return (mantissa.includes('.') ? mantissa : `${mantissa}.`) + (exponent ? `E${exponent}` : '');
};

const stepEnum = (value: string) => `.${value.toUpperCase().replace(/[^A-Z0-9_]/g, '')}.`;

const list = (items: (string | number)[]) => `(${items.join(',')})`;

const ref = (id: number) => `#${id}`;

/** a property value in its STEP type, e.g. IFCLABEL('REI30') or IFCBOOLEAN(.T.) */
const stepValue = ({ value, type }: IfcValue) => {
  if (value == null) {
    return '$';
  }
  if (typeof value === 'boolean' || type === 'IFCBOOLEAN' || type === 'IFCLOGICAL') {
    return `${type === 'IFCLOGICAL' ? 'IFCLOGICAL' : 'IFCBOOLEAN'}(${value === true || value === 'T' ? '.T.' : '.F.'})`;
  }
  if (typeof value === 'number') {
    const numericType =
      /^IFC[A-Z]+$/.test(type) && type !== 'IFCLABEL' && type !== 'IFCTEXT' && type !== 'IFCIDENTIFIER' ? type : 'IFCREAL';
    return `${numericType}(${numericType === 'IFCINTEGER' || numericType === 'IFCCOUNTMEASURE' ? Math.round(value) : stepReal(value)})`;
  }
  const textType = ['IFCTEXT', 'IFCIDENTIFIER', 'IFCLABEL'].includes(type) ? type : 'IFCLABEL';
  return `${textType}(${stepString(String(value))})`;
};

/** quantity entities and the attribute order they share: Name, Description, Unit, <value>, Formula */
const QUANTITY_TYPES = [
  'IFCQUANTITYLENGTH',
  'IFCQUANTITYAREA',
  'IFCQUANTITYVOLUME',
  'IFCQUANTITYCOUNT',
  'IFCQUANTITYWEIGHT',
  'IFCQUANTITYTIME',
];

// ------------------------------------------------------------ model walk
interface Triangles {
  points: Vector3[];
}

/** Writes the whole model as an IFC4 file. */
export const exportIfc = (editor: Editor, application: string): string => {
  const lines: string[] = [];
  const add = (entity: string) => {
    lines.push(`#${lines.length + 1}=${entity};`);
    return lines.length;
  };
  const usedGuids = new Set<string>();
  /** the stored GlobalId – unless another copy of the same group already used it */
  const guidFor = (data?: IfcData) => {
    let guid = isGuid(data?.guid) && !usedGuids.has(data.guid) ? data.guid : newGuid();
    while (usedGuids.has(guid)) {
      guid = newGuid();
    }
    usedGuids.add(guid);
    return stepString(guid);
  };
  const model = editor.model;
  const rootData = { project: undefined as IfcData | undefined, projectName: model.name || 'Shap3D.ai' }; // i18n-ignore

  // shared geometry context
  const origin = add('IFCCARTESIANPOINT((0.,0.,0.))');
  const axis = add(`IFCAXIS2PLACEMENT3D(${ref(origin)},$,$)`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(axis)},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ref(context)},$,.MODEL_VIEW.,$)`);
  const units = add(
    `IFCUNITASSIGNMENT(${list([
      ref(add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')),
      ref(add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')),
      ref(add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')),
      ref(add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')),
    ])})`,
  );
  const placementIn = (parentPlacement: number | null) =>
    add(`IFCLOCALPLACEMENT(${parentPlacement ? ref(parentPlacement) : '$'},${ref(axis)})`);

  // surface styles per model material
  const styles = new Map<string, number>();
  const styleFor = (materialName: string | undefined) => {
    if (!materialName) {
      return null;
    }
    let style = styles.get(materialName);
    if (style == null) {
      const material = model.material(materialName);
      const color = new THREE.Color(material?.color ?? '#cccccc');
      const rgb = add(`IFCCOLOURRGB($,${stepReal(color.r)},${stepReal(color.g)},${stepReal(color.b)})`);
      const shading = add(`IFCSURFACESTYLESHADING(${ref(rgb)},${stepReal(1 - (material?.opacity ?? 1))})`);
      style = add(`IFCSURFACESTYLE(${stepString(materialName)},.BOTH.,(${ref(shading)}))`);
      styles.set(materialName, style);
    }
    return style;
  };

  /** collects the triangles of `entities` (and of nested groups without an IFC class), by material */
  const classifiedInside = new Map<Definition, boolean>();
  const hasClassified = (definition: Definition): boolean => {
    let found = classifiedInside.get(definition);
    if (found == null) {
      found = [...definition.entities.instances.values()].some(
        (instance) => !!ifcOf(instance.definition) || hasClassified(instance.definition),
      );
      classifiedInside.set(definition, found);
    }
    return found;
  };
  const collectTriangles = (
    entities: Entities,
    matrix: Matrix4,
    inherited: string | undefined,
    byMaterial: Map<string, Triangles>,
    deep: boolean,
  ) => {
    for (const face of entities.faces.values()) {
      if (face.hidden) {
        continue;
      }
      const material = face.material ?? inherited ?? '';
      const target = byMaterial.get(material) ?? byMaterial.set(material, { points: [] }).get(material)!;
      const corners = [...face.outer, ...face.holes.flat()];
      const indices = entities.faceTriangles(face);
      for (const index of indices) {
        target.points.push(entities.positionOf(corners[index]).clone().applyMatrix4(matrix));
      }
    }
    if (!deep) {
      return;
    }
    for (const instance of entities.instances.values()) {
      if (!instance.hidden && !ifcOf(instance.definition) && !hasClassified(instance.definition)) {
        collectTriangles(
          instance.definition.entities,
          matrix.clone().multiply(instance.matrix),
          instance.material ?? inherited,
          byMaterial,
          true,
        );
      }
    }
  };

  /** a body representation from triangles; returns the shape and its main material */
  const shapeOf = (byMaterial: Map<string, Triangles>) => {
    const items: number[] = [];
    let mainMaterial: string | undefined,
      mostTriangles = 0;
    for (const [material, triangles] of byMaterial) {
      if (!triangles.points.length) {
        continue;
      }
      const pointIndex = new Map<string, number>();
      const coordinates: string[] = [];
      const indices: string[] = [];
      for (let i = 0; i < triangles.points.length; i += 3) {
        const corners = [0, 1, 2].map((corner) => {
          const point = triangles.points[i + corner];
          const key = `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`;
          let index = pointIndex.get(key);
          if (index == null) {
            coordinates.push(`(${stepReal(point.x)},${stepReal(point.y)},${stepReal(point.z)})`);
            index = coordinates.length;
            pointIndex.set(key, index);
          }
          return index;
        });
        if (new Set(corners).size === 3) {
          indices.push(list(corners));
        }
      }
      if (!indices.length) {
        continue;
      }
      const pointList = add(`IFCCARTESIANPOINTLIST3D(${list(coordinates)})`);
      const faceSet = add(`IFCTRIANGULATEDFACESET(${ref(pointList)},$,$,${list(indices)},$)`);
      const style = styleFor(material || undefined);
      if (style) {
        add(`IFCSTYLEDITEM(${ref(faceSet)},(${ref(style)}),$)`);
      }
      items.push(faceSet);
      if (material && triangles.points.length > mostTriangles) {
        mostTriangles = triangles.points.length;
        mainMaterial = material;
      }
    }
    if (!items.length) {
      return { shape: null, representation: null, mainMaterial };
    }
    const representation = add(`IFCSHAPEREPRESENTATION(${ref(body)},'Body','Tessellation',${list(items.map(ref))})`);
    return { shape: add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${ref(representation)}))`), representation, mainMaterial };
  };

  // relations, written at the end
  const aggregates = new Map<number, number[]>();
  const contained = new Map<number, number[]>();
  const layers = new Map<string, number[]>();
  const materialUse = new Map<string, number[]>();
  const propertyUse: { element: number; data: IfcData }[] = [];
  const push = <K>(map: Map<K, number[]>, key: K, value: number) => (map.get(key) ?? map.set(key, []).get(key)!).push(value);

  // the spatial structure; the default site/building/storey are only made when something needs them
  const project = { id: 0, placement: 0 };
  const placements = new Map<number, number>();
  let defaultSite: number | null = null,
    defaultBuilding: number | null = null,
    defaultStorey: number | null = null;
  const spatial = (ifcClass: string, data: IfcData | undefined, name: string, parent: number, shape: number | null = null) => {
    const placement = placementIn(placements.get(parent) ?? null);
    const head = `${guidFor(data)},$,${stepString(name)},${stepString(data?.description)},${stepString(data?.objectType)},${ref(placement)}`;
    const longName = stepString(data?.longName);
    const entity =
      ifcClass === 'IfcSite'
        ? `IFCSITE(${head},$,${longName},.ELEMENT.,$,$,$,$,$)`
        : ifcClass === 'IfcBuilding'
          ? `IFCBUILDING(${head},$,${longName},.ELEMENT.,$,$,$)`
          : ifcClass === 'IfcBuildingStorey'
            ? `IFCBUILDINGSTOREY(${head},$,${longName},.ELEMENT.,$)`
            : `IFCSPACE(${head},${shape ? ref(shape) : '$'},${longName},.ELEMENT.,${data?.predefinedType ? stepEnum(data.predefinedType) : '$'},$)`;
    const id = add(entity);
    placements.set(id, placement);
    push(aggregates, parent, id);
    if (data) {
      propertyUse.push({ element: id, data });
    }
    return id;
  };
  const siteFor = () => (defaultSite ??= spatial('IfcSite', undefined, 'Site', project.id)); // i18n-ignore – IFC default names
  const buildingFor = () => (defaultBuilding ??= spatial('IfcBuilding', undefined, 'Building', siteFor())); // i18n-ignore
  const storeyFor = () => (defaultStorey ??= spatial('IfcBuildingStorey', undefined, 'Storey', buildingFor())); // i18n-ignore
  /** where a spatial element of this class may go below `container` */
  const parentFor = (ifcClass: string, container: { id: number; class: string } | null) => {
    const containerClass = container?.class ?? 'IfcProject';
    if (ifcClass === 'IfcSite') {
      return containerClass === 'IfcSite' ? container!.id : project.id;
    }
    if (ifcClass === 'IfcBuilding') {
      return containerClass === 'IfcSite' || containerClass === 'IfcBuilding' ? container!.id : siteFor();
    }
    if (ifcClass === 'IfcBuildingStorey') {
      return containerClass === 'IfcBuilding' || containerClass === 'IfcBuildingStorey' ? container!.id : buildingFor();
    }
    return containerClass === 'IfcProject' ? storeyFor() : container!.id;
  };

  const element = (
    data: IfcData | undefined,
    name: string,
    byMaterial: Map<string, Triangles>,
    container: { id: number; class: string } | null,
    parentElement: number | null,
    tag?: string,
  ) => {
    const target = exportClass(data?.class);
    const containerId = parentElement ? null : container && container.class !== 'IfcProject' ? container.id : storeyFor();
    const placement = placementIn(placements.get(parentElement ?? containerId!) ?? null);
    const { shape, representation, mainMaterial } = shapeOf(byMaterial);
    const keepsClass = target.name === data?.class?.replace(/(StandardCase|ElementedCase)$/, '');
    // a class we cannot write keeps its name as ObjectType of the proxy
    const objectType = data?.objectType ?? (data?.class && !keepsClass ? data.class : undefined);
    const attributes = [
      guidFor(data),
      '$',
      stepString(name),
      stepString(data?.description),
      stepString(objectType),
      ref(placement),
      shape ? ref(shape) : '$',
      '$',
    ];
    for (let i = attributes.length; i < target.attributes; i++) {
      attributes.push(i === target.predefinedAt && data?.predefinedType && keepsClass ? stepEnum(data.predefinedType) : '$');
    }
    const id = add(`${target.name.toUpperCase()}(${attributes.join(',')})`);
    placements.set(id, placement);
    if (parentElement) {
      push(aggregates, parentElement, id);
    } else {
      push(contained, containerId!, id);
    }
    if (representation && tag && tag !== 'Untagged') {
      push(layers, tag, representation);
    }
    const material = data?.material ?? mainMaterial;
    if (material) {
      push(materialUse, material, id);
    }
    if (data) {
      propertyUse.push({ element: id, data });
    }
    return id;
  };

  /** places the instances of `entities`: spatial groups nest, classified groups become elements */
  const walk = (
    entities: Entities,
    matrix: Matrix4,
    container: { id: number; class: string } | null,
    parentElement: number | null,
    inherited?: string,
  ) => {
    for (const instance of entities.instances.values()) {
      if (instance.hidden) {
        continue;
      }
      const definition = instance.definition;
      const data = ifcOf(definition);
      const world = matrix.clone().multiply(instance.matrix);
      const material = instance.material ?? inherited;
      const name = instance.name || definition.name;
      if (data?.class === 'IfcProject') {
        rootData.project ??= data;
        rootData.projectName = name;
        walkLoose(definition.entities, world, container, parentElement, material, name);
        walk(definition.entities, world, container, parentElement, material);
      } else if (parentElement && !data && !hasClassified(definition)) {
        // already part of the parent element's geometry
        continue;
      } else if (isSpatial(data?.class) && !parentElement) {
        const parent = parentFor(data!.class, container);
        // the faces lying directly in it: a space's own body, or a proxy element in a site/building/storey
        const own = new Map<string, Triangles>();
        collectTriangles(definition.entities, world, material, own, false);
        const isSpace = data!.class === 'IfcSpace';
        const id = spatial(data!.class, data, name, parent, isSpace ? shapeOf(own).shape : null);
        const here = { id, class: data!.class };
        if (!isSpace && [...own.values()].some((triangles) => triangles.points.length)) {
          element(undefined, name, own, here, null, instance.tag);
        }
        walk(definition.entities, world, here, null, material);
      } else if (data || !hasClassified(definition)) {
        // an element: its own faces plus unclassified sub-groups; classified sub-groups become its parts
        const geometry = new Map<string, Triangles>();
        collectTriangles(definition.entities, world, material, geometry, true);
        const id = element(data, name, geometry, container, parentElement, instance.tag);
        walk(definition.entities, world, container, id, material);
      } else {
        // an unclassified group around classified ones: its own faces become a proxy, the rest goes through
        walkLoose(definition.entities, world, container, parentElement, material, name);
        walk(definition.entities, world, container, parentElement, material);
      }
    }
  };
  /** the faces lying directly in `entities` (not in sub-groups) as one proxy element */
  const walkLoose = (
    entities: Entities,
    matrix: Matrix4,
    container: { id: number; class: string } | null,
    parentElement: number | null,
    inherited: string | undefined,
    name: string,
  ) => {
    const geometry = new Map<string, Triangles>();
    collectTriangles(entities, matrix, inherited, geometry, false);
    if ([...geometry.values()].some((triangles) => triangles.points.length)) {
      element(undefined, name, geometry, container, parentElement);
    }
  };

  // the project comes first so everything can refer to it; its attributes are filled in at the end
  project.id = add('PROJECT');
  walkLoose(model.root, new THREE.Matrix4(), null, null, undefined, rootData.projectName);
  walk(model.root, new THREE.Matrix4(), null, null);
  lines[project.id - 1] =
    `#${project.id}=IFCPROJECT(${guidFor(rootData.project)},$,${stepString(rootData.projectName)},${stepString(rootData.project?.description)},$,${stepString(
      rootData.project?.longName,
    )},$,(${ref(context)}),${ref(units)});`;
  if (rootData.project) {
    propertyUse.push({ element: project.id, data: rootData.project });
  }

  // relations
  for (const [parent, children] of aggregates) {
    add(`IFCRELAGGREGATES(${guidFor()},$,$,$,${ref(parent)},${list(children.map(ref))})`);
  }
  for (const [structure, elements] of contained) {
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guidFor()},$,$,$,${list(elements.map(ref))},${ref(structure)})`);
  }
  for (const [name, elements] of materialUse) {
    const material = add(`IFCMATERIAL(${stepString(name)},$,$)`);
    add(`IFCRELASSOCIATESMATERIAL(${guidFor()},$,$,$,${list(elements.map(ref))},${ref(material)})`);
  }
  const writeSets = (owner: number, sets: IfcPropertySets | undefined, quantities: boolean) => {
    for (const [setName, values] of Object.entries(sets ?? {})) {
      const items: number[] = [];
      for (const [name, value] of Object.entries(values)) {
        if (!quantities) {
          items.push(add(`IFCPROPERTYSINGLEVALUE(${stepString(name)},$,${stepValue(value)},$)`));
        } else if (QUANTITY_TYPES.includes(value.type) && typeof value.value === 'number') {
          const amount = value.type === 'IFCQUANTITYCOUNT' ? stepReal(Math.round(value.value)) : stepReal(value.value);
          items.push(add(`${value.type}(${stepString(name)},$,$,${amount},$)`));
        }
      }
      if (items.length) {
        const set = add(
          quantities
            ? `IFCELEMENTQUANTITY(${guidFor()},$,${stepString(setName)},$,$,${list(items.map(ref))})`
            : `IFCPROPERTYSET(${guidFor()},$,${stepString(setName)},$,${list(items.map(ref))})`,
        );
        add(`IFCRELDEFINESBYPROPERTIES(${guidFor()},$,$,$,(${ref(owner)}),${ref(set)})`);
      }
    }
  };
  for (const { element: id, data } of propertyUse) {
    writeSets(id, data.properties, false);
    writeSets(id, data.quantities, true);
  }
  for (const [name, representations] of layers) {
    add(`IFCPRESENTATIONLAYERASSIGNMENT(${stepString(name)},$,${list(representations.map(ref))},$)`);
  }

  const timestamp = new Date().toISOString().slice(0, 19);
  const fileName = `${model.name || 'model'}.ifc`; // i18n-ignore
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${stepString(fileName)},'${timestamp}',(''),(''),${stepString(application)},${stepString(application)},'');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
};
