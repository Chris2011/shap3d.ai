import type { TextureKind } from './textures';

/**
 * Ready-made materials. Scripts can use them by name without defining them first:
 * s3d.box([0, 0, 0], 1, 1, 1, { material: 'Glas' }) – the material is created on first use.
 */
export interface LibraryMaterial { name: string; color: string; category: MaterialCategory; texture?: TextureKind; size?: number; opacity?: number; note?: string }
export type MaterialCategory = 'Holz' | 'Stein & Mineral' | 'Metall' | 'Glas & Kunststoff' | 'Natur' | 'Stoff & Leder' | 'Farben';

export const MATERIAL_CATEGORIES: MaterialCategory[] = ['Holz', 'Stein & Mineral', 'Metall', 'Glas & Kunststoff', 'Natur', 'Stoff & Leder', 'Farben'];

export const MATERIAL_LIBRARY: LibraryMaterial[] = [
  // wood
  { name: 'Holz', color: '#a0703c', category: 'Holz', texture: 'holz', note: 'Standard-Holz mit Maserung' },
  { name: 'Eiche hell', color: '#c9a36b', category: 'Holz', texture: 'holz' },
  { name: 'Nussbaum', color: '#5e3b23', category: 'Holz', texture: 'holz' },
  { name: 'Kiefer', color: '#d8b47a', category: 'Holz', texture: 'holz' },
  { name: 'Parkett', color: '#b7864f', category: 'Holz', texture: 'parkett' },
  { name: 'Holz lackiert weiß', color: '#f1eee7', category: 'Holz' },
  // stone & mineral
  { name: 'Ziegel', color: '#a4452c', category: 'Stein & Mineral', texture: 'ziegel' },
  { name: 'Dachziegel', color: '#8e3a26', category: 'Stein & Mineral', texture: 'dach' },
  { name: 'Beton', color: '#a3a39e', category: 'Stein & Mineral', texture: 'beton' },
  { name: 'Naturstein', color: '#9b9488', category: 'Stein & Mineral', texture: 'stein' },
  { name: 'Marmor', color: '#ecebe6', category: 'Stein & Mineral', texture: 'marmor' },
  { name: 'Fliesen', color: '#e6e8ea', category: 'Stein & Mineral', texture: 'fliesen' },
  { name: 'Putz weiß', color: '#efece4', category: 'Stein & Mineral' },
  { name: 'Asphalt', color: '#3d3f42', category: 'Stein & Mineral', texture: 'beton', size: 3 },
  // metal
  { name: 'Stahl', color: '#8d9399', category: 'Metall', texture: 'metall' },
  { name: 'Edelstahl', color: '#c4c8cc', category: 'Metall', texture: 'metall' },
  { name: 'Aluminium', color: '#b5b9bd', category: 'Metall' },
  { name: 'Gold', color: '#d4a62a', category: 'Metall', texture: 'metall' },
  { name: 'Messing', color: '#b8923a', category: 'Metall' },
  { name: 'Kupfer', color: '#b5653a', category: 'Metall', texture: 'metall' },
  { name: 'Eisen schwarz', color: '#2b2c2e', category: 'Metall' },
  // glass & plastic
  { name: 'Glas', color: '#bcd8e6', category: 'Glas & Kunststoff', opacity: 0.35, note: 'durchsichtig' },
  { name: 'Glas getönt', color: '#5d7480', category: 'Glas & Kunststoff', opacity: 0.5 },
  { name: 'Milchglas', color: '#e8eef0', category: 'Glas & Kunststoff', opacity: 0.7 },
  { name: 'Kunststoff weiß', color: '#f4f4f2', category: 'Glas & Kunststoff' },
  { name: 'Kunststoff schwarz', color: '#222324', category: 'Glas & Kunststoff' },
  { name: 'Gummi', color: '#1c1c1c', category: 'Glas & Kunststoff' },
  // nature
  { name: 'Gras', color: '#6fa347', category: 'Natur', texture: 'gras' },
  { name: 'Wasser', color: '#3f7fae', category: 'Natur', texture: 'wasser', opacity: 0.8 },
  { name: 'Erde', color: '#8a6342', category: 'Natur', texture: 'stein', size: 2 },
  { name: 'Fels', color: '#9a968e', category: 'Natur', texture: 'stein', size: 3, note: 'Berge, Klippen' },
  { name: 'Schnee', color: '#f3f6f9', category: 'Natur' },
  { name: 'Sand', color: '#d9c393', category: 'Natur', texture: 'beton' },
  { name: 'Laub', color: '#3f7a2e', category: 'Natur', texture: 'gras', size: 0.8 },
  { name: 'Rinde', color: '#4a3424', category: 'Natur', texture: 'holz', size: 0.5 },
  // fabric & leather
  { name: 'Stoff grau', color: '#8b8f94', category: 'Stoff & Leder', texture: 'stoff' },
  { name: 'Stoff blau', color: '#3c5a8a', category: 'Stoff & Leder', texture: 'stoff' },
  { name: 'Stoff rot', color: '#9c2f2f', category: 'Stoff & Leder', texture: 'stoff' },
  { name: 'Leder braun', color: '#6e4127', category: 'Stoff & Leder' },
  { name: 'Leder schwarz', color: '#26211e', category: 'Stoff & Leder' },
  // plain colours
  { name: 'Weiß', color: '#f5f5f5', category: 'Farben' },
  { name: 'Schwarz', color: '#1a1a1a', category: 'Farben' },
  { name: 'Grau', color: '#8a8a8a', category: 'Farben' },
  { name: 'Rot', color: '#d32f2f', category: 'Farben' },
  { name: 'Orange', color: '#ef8a1f', category: 'Farben' },
  { name: 'Gelb', color: '#f2c81d', category: 'Farben' },
  { name: 'Grün', color: '#3e9b4f', category: 'Farben' },
  { name: 'Blau', color: '#2f6fc4', category: 'Farben' },
  { name: 'Hellblau', color: '#8cc4ea', category: 'Farben' },
  { name: 'Violett', color: '#7b4bb3', category: 'Farben' },
  { name: 'Rosa', color: '#ef9ab8', category: 'Farben' },
  { name: 'Braun', color: '#7a4e2a', category: 'Farben' },
];

const byName = new Map(MATERIAL_LIBRARY.map(material => [material.name.toLowerCase(), material]));
export const libraryMaterial = (name: string) => byName.get(name.trim().toLowerCase());
