import type * as WebIfc from 'web-ifc';
import type { IfcData, IfcPropertySets, IfcValue } from './ifcData';

/**
 * The IFC reader, in a worker (ifcWorker.ts): web-ifc (WebAssembly) parses the file and triangulates every
 * product. It knows nothing of the app – errors are message keys, the app shows them in its language.
 */

type IfcAPI = WebIfc.IfcAPI;

const MAX_TRIANGLES = 200_000;

/** the web-ifc module – shipped next to plugin.js in the package, imported on the first IFC import */
let webIfc: typeof WebIfc;
let apiPromise: Promise<IfcAPI> | null = null;

/** where the plugin's copies of web-ifc are */
export interface IfcUrls {
  api: string;
  wasm: string;
}

/** web-ifc, started once; single-threaded so it needs no cross-origin isolation */
const loadApi = (urls: IfcUrls) =>
  (apiPromise ??= (async () => {
    webIfc = (await import(/* @vite-ignore */ urls.api)) as typeof WebIfc;
    const api = new webIfc.IfcAPI();
    await api.Init((path) => (path.endsWith('.wasm') ? urls.wasm : path), true);
    return api;
  })().catch((error) => {
    apiPromise = null;
    throw error;
  }));

/** what is read from the file, before anything is put into the model */
export interface ProductNode {
  id: number;
  data: IfcData;
  name: string;
  /** world-space triangles (Z up, metres) with their colour */
  mesh?: { vertices: [number, number, number][]; faces: number[][]; colors: string[] };
  children: ProductNode[];
}

/** Reads the value of a web-ifc attribute ({ value } or a number wrapper) */
const plain = (attribute: any) => attribute?._representationValue ?? attribute?.value ?? null;

const text = (attribute: any): string | undefined => {
  const value = plain(attribute);
  return value == null || value === '' ? undefined : String(value);
};

/** factors from the file's units to metres, square metres and cubic metres */
interface UnitScales {
  length: number;
  area: number;
  volume: number;
}

/** reads the project's units – files often use millimetres for lengths but square metres for areas */
const readUnits = (api: IfcAPI, modelId: number): UnitScales => {
  const scales: UnitScales = { length: 1, area: 1, volume: 1 };
  const projects = api.GetLineIDsWithType(modelId, webIfc.IFCPROJECT);
  const units = projects.size() ? api.GetLine(modelId, projects.get(0)).UnitsInContext : null;
  if (!units) {
    return scales;
  }
  const prefixes: Record<string, number> = { KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6 };
  const kinds: Record<string, [keyof UnitScales, number]> = { LENGTHUNIT: ['length', 1], AREAUNIT: ['area', 2], VOLUMEUNIT: ['volume', 3] };
  /** an SI unit with its prefix, e.g. MILLI + SQUARE_METRE = 1e-6 */
  const siFactor = (unit: any, power: number) => (prefixes[plain(unit?.Prefix)] ?? 1) ** power;
  for (const handle of api.GetLine(modelId, units.value).Units ?? []) {
    const unit = api.GetLine(modelId, handle.value);
    const kind = kinds[plain(unit.UnitType)];
    if (!kind) {
      continue;
    }
    const [key, power] = kind;
    if (unit.ConversionFactor) {
      // a conversion-based unit (inch, square foot …): its factor is given in an SI unit
      const measure = api.GetLine(modelId, unit.ConversionFactor.value);
      const base = measure.UnitComponent ? api.GetLine(modelId, measure.UnitComponent.value) : null;
      scales[key] = Number(plain(measure.ValueComponent)) * siFactor(base, power);
    } else {
      scales[key] = siFactor(unit, power);
    }
  }
  return scales;
};

/** property values and quantities in file units → metres, square metres, cubic metres */
const toMetres = (value: IfcValue, scales: UnitScales): IfcValue => {
  if (typeof value.value !== 'number') {
    return value;
  }
  const factor = /AREA/.test(value.type)
    ? scales.area
    : /VOLUME/.test(value.type)
      ? scales.volume
      : /LENGTH/.test(value.type)
        ? scales.length
        : 1;
  return { ...value, value: value.value * factor };
};

const QUANTITY_VALUES = ['LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'WeightValue', 'TimeValue'];

/** property sets and quantity sets of every element, by element id */
const readPropertySets = (api: IfcAPI, modelId: number, scales: UnitScales) => {
  const result = new Map<number, { properties: IfcPropertySets; quantities: IfcPropertySets }>();
  const relations = api.GetLineIDsWithType(modelId, webIfc.IFCRELDEFINESBYPROPERTIES);
  for (let i = 0; i < relations.size(); i++) {
    const relation = api.GetLine(modelId, relations.get(i));
    const definition = relation.RelatingPropertyDefinition?.value;
    if (definition == null) {
      continue;
    }
    const set = api.GetLine(modelId, definition);
    const isQuantities = set.type === webIfc.IFCELEMENTQUANTITY;
    if (set.type !== webIfc.IFCPROPERTYSET && !isQuantities) {
      continue;
    }
    const values: Record<string, IfcValue> = {};
    for (const handle of (isQuantities ? set.Quantities : set.HasProperties) ?? []) {
      const item = api.GetLine(modelId, handle.value);
      const name = text(item.Name);
      if (!name) {
        continue;
      }
      if (isQuantities) {
        const key = QUANTITY_VALUES.find((candidate) => item[candidate]);
        if (key) {
          values[name] = toMetres({ value: Number(plain(item[key])), type: api.GetNameFromTypeCode(item.type).toUpperCase() }, scales);
        }
      } else if (item.type === webIfc.IFCPROPERTYSINGLEVALUE && item.NominalValue) {
        values[name] = toMetres({ value: plain(item.NominalValue), type: item.NominalValue.name ?? 'IFCLABEL' }, scales);
      }
    }
    const setName = text(set.Name) ?? (isQuantities ? 'Quantities' : 'Properties'); // i18n-ignore – IFC names
    for (const handle of relation.RelatedObjects ?? []) {
      const entry = result.get(handle.value) ?? { properties: {}, quantities: {} };
      (isQuantities ? entry.quantities : entry.properties)[setName] = values;
      result.set(handle.value, entry);
    }
  }
  return result;
};

/** the name of the material associated with each element (material, layer set, list …) */
const readMaterials = (api: IfcAPI, modelId: number) => {
  const result = new Map<number, string>();
  const nameOf = (id: number, depth = 0): string | undefined => {
    const line = api.GetLine(modelId, id);
    const own = text(line.Name) ?? text(line.LayerSetName) ?? text(line.MaterialSetName);
    if (own || depth > 3) {
      return own;
    }
    const next =
      line.ForLayerSet ??
      line.ForProfileSet ??
      line.Material ??
      line.MaterialLayers?.[0] ??
      line.Materials?.[0] ??
      line.MaterialConstituents?.[0];
    return next?.value != null ? nameOf(next.value, depth + 1) : undefined;
  };
  const relations = api.GetLineIDsWithType(modelId, webIfc.IFCRELASSOCIATESMATERIAL);
  for (let i = 0; i < relations.size(); i++) {
    const relation = api.GetLine(modelId, relations.get(i));
    const name = relation.RelatingMaterial ? nameOf(relation.RelatingMaterial.value) : undefined;
    if (name) {
      for (const handle of relation.RelatedObjects ?? []) {
        result.set(handle.value, name);
      }
    }
  }
  return result;
};

const colorHex = (color: { x: number; y: number; z: number }) =>
  '#' +
  [color.x, color.y, color.z]
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** Reads the file: products with their triangles, the spatial tree, attributes and property sets. */
const readWith = async (api: IfcAPI, fileData: Uint8Array) => {
  const modelId = api.OpenModel(fileData, { COORDINATE_TO_ORIGIN: true });
  if (modelId < 0) {
    throw new Error('ifc.errors.unreadable');
  }
  try {
    const schema = api.GetModelSchema(modelId);
    const propertySets = readPropertySets(api, modelId, readUnits(api, modelId));
    const materials = readMaterials(api, modelId);

    // geometry per product – web-ifc hands out Y-up metres, our world is Z-up
    const meshes = new Map<number, NonNullable<ProductNode['mesh']>>();
    let triangles = 0,
      skipped = 0;
    api.StreamAllMeshes(modelId, (flatMesh) => {
      const mesh = meshes.get(flatMesh.expressID) ?? { vertices: [], faces: [], colors: [] };
      for (let g = 0; g < flatMesh.geometries.size(); g++) {
        const placed = flatMesh.geometries.get(g);
        const geometry = api.GetGeometry(modelId, placed.geometryExpressID);
        const vertexData = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indexData = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        const matrix = placed.flatTransformation;
        const offset = mesh.vertices.length;
        // 6 floats per vertex: position and normal
        for (let i = 0; i < vertexData.length; i += 6) {
          const [x, y, z] = [vertexData[i], vertexData[i + 1], vertexData[i + 2]];
          mesh.vertices.push([
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            -(matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]),
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          ]);
        }
        const color = `${colorHex(placed.color)}|${placed.color.w.toFixed(2)}`;
        for (let i = 0; i + 2 < indexData.length; i += 3) {
          if (triangles >= MAX_TRIANGLES) {
            skipped++;
            continue;
          }
          mesh.faces.push([offset + indexData[i], offset + indexData[i + 1], offset + indexData[i + 2]]);
          mesh.colors.push(color);
          triangles++;
        }
        geometry.delete();
      }
      if (mesh.faces.length) {
        meshes.set(flatMesh.expressID, mesh);
      }
    });

    const productNode = (id: number): ProductNode => {
      const line = api.GetLine(modelId, id);
      const ifcClass = api.GetNameFromTypeCode(line.type);
      const sets = propertySets.get(id);
      const data: IfcData = {
        class: ifcClass,
        guid: text(line.GlobalId),
        predefinedType: text(line.PredefinedType),
        objectType: text(line.ObjectType),
        description: text(line.Description),
        longName: text(line.LongName),
        material: materials.get(id),
        properties: sets && Object.keys(sets.properties).length ? sets.properties : undefined,
        quantities: sets && Object.keys(sets.quantities).length ? sets.quantities : undefined,
      };
      for (const key of Object.keys(data) as (keyof IfcData)[]) {
        if (data[key] === undefined) {
          delete data[key];
        }
      }
      return { id, data, name: text(line.Name) ?? text(line.LongName) ?? ifcClass, mesh: meshes.get(id), children: [] };
    };

    // spatial tree with aggregated parts; keep only branches that carry geometry
    const placed = new Set<number>();
    const buildTree = (node: { expressID: number; children: any[] }): ProductNode | null => {
      const product = productNode(node.expressID);
      placed.add(node.expressID);
      product.children = node.children.map(buildTree).filter((child): child is ProductNode => !!child);
      return product.mesh || product.children.length || product.data.class === 'IfcProject' ? product : null;
    };
    const project = buildTree(await api.properties.getSpatialStructure(modelId, false));
    if (!project) {
      throw new Error('ifc.errors.noGeometry');
    }
    // products with geometry that are not part of the spatial structure
    for (const id of meshes.keys()) {
      if (!placed.has(id)) {
        project.children.push(productNode(id));
      }
    }
    if (!triangles) {
      throw new Error('ifc.errors.noGeometry');
    }
    return { project, schema, triangles, skipped };
  } finally {
    api.CloseModel(modelId);
  }
};

/** Reads an IFC file: its spatial structure with every product's triangles. */
export const readIfc = async (urls: IfcUrls, fileData: Uint8Array) => readWith(await loadApi(urls), fileData);
