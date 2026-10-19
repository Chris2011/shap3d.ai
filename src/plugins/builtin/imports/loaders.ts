import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { readBlend } from './blend/blendScene';
import type { LoadedScene } from '../../fileFormats';

/**
 * The file readers of the "Importformate" plugin. This module (and the three.js loaders it pulls
 * in) is only loaded the first time one of these formats is imported.
 */

/**
 * FBX stores its unit in GlobalSettings › UnitScaleFactor (centimetres per unit: cm = 1, m = 100, inch = 2.54).
 * Returns the factor to metres, or null if the file does not say.
 */
const fbxUnitScale = (data: ArrayBuffer): number | null => {
  const bytes = new Uint8Array(data);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 23));
  if (!head.startsWith('Kaydara FBX Binary')) {
    const match = new TextDecoder().decode(bytes).match(/"UnitScaleFactor"[^\n]*?,\s*([-\d.eE+]+)\s*$/m);
    return match ? parseFloat(match[1]) / 100 : null;
  }
  // binary: P: "UnitScaleFactor", "double", "Number", "", <double> – three 'S' string props, then a 'D'
  const key = new TextEncoder().encode('UnitScaleFactor');
  outer: for (let i = 0; i < bytes.length - key.length; i++) {
    for (let k = 0; k < key.length; k++) if (bytes[i + k] !== key[k]) continue outer;
    const view = new DataView(data); let cursor = i + key.length;
    for (let skip = 0; skip < 3; skip++) { if (bytes[cursor] !== 0x53) return null; cursor += 5 + view.getUint32(cursor + 1, true); }
    if (bytes[cursor] !== 0x44) return null;
    const value = view.getFloat64(cursor + 1, true);
    return value > 0 ? value / 100 : null;
  }
  return null;
};

/** Reads one file into a three.js scene (with its up axis and unit). */
export const loadScene = async (ext: string, file: File): Promise<LoadedScene> => {
  const buffer = () => file.arrayBuffer(), text = () => file.text();
  switch (ext) {
    // Collada handles its own unit (<unit meter>) and up axis (<up_axis>) and hands back a Y-up scene in metres
    case 'dae': {
      const collada = new ColladaLoader().parse(await text(), '');
      if (!collada?.scene) throw new Error('Die Collada-Datei konnte nicht gelesen werden.');
      return { object: collada.scene, upY: true, scale: 1 };
    }
    case 'kmz': return { object: new KMZLoader().parse(await buffer()).scene, upY: true, scale: 1 };
    // FBX (3ds Max, Blender, Maya): the loader turns Z-up files to Y-up, units vary (often cm)
    case 'fbx': { const data = await buffer(); return { object: new FBXLoader().parse(data, ''), upY: true, scale: fbxUnitScale(data) }; }
    // 3DS (old 3ds Max format): stays in its own Z-up space, units vary
    case '3ds': return { object: new TDSLoader().parse(await buffer(), ''), upY: false, scale: null };
    case 'ply': {
      const geometry = new PLYLoader().parse(await buffer()); geometry.computeVertexNormals();
      return { object: new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: geometry.hasAttribute('color') })), upY: true, scale: null };
    }
    // 3MF and AMF (3D printing) are Z-up in millimetres
    case '3mf': return { object: new ThreeMFLoader().parse(await buffer()), upY: false, scale: 0.001 };
    case 'amf': return { object: new AMFLoader().parse(await buffer()), upY: false, scale: 0.001 };
    case 'wrl': case 'vrml': return { object: new VRMLLoader().parse(await text(), ''), upY: true, scale: 1 };
    case 'usdz': case 'usda': case 'usdc': case 'usd': {
      const data = await buffer();
      const object = await new Promise<THREE.Object3D>((resolve, reject) => new USDLoader().parse(data, '', resolve as any, reject as any));
      return { object, upY: true, scale: 1 };
    }
    // Blender files are read right here in the browser (Z-up, metres) – no Blender needed
    case 'blend': {
      const result = readBlend(await buffer());
      if (!result.objects) throw new Error(`In der Blender-Datei (Version ${(result.version / 100).toFixed(2)}) wurden keine Mesh-Objekte gefunden.` + (result.skipped.length ? ` Übersprungen: ${result.skipped.slice(0, 3).join(', ')}` : ''));
      return { object: result.scene, upY: false, scale: 1 };
    }
  }
  throw new Error('Nicht unterstütztes Format: ' + ext);
};
