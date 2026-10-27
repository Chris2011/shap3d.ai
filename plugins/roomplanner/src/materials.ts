import { t } from './runtime';

/**
 * The finishes furniture is made of. The names go into the model in the language that is active when a piece is
 * placed (like any material the user makes); colour and texture come from here.
 */
export type MaterialId =
  | 'white'
  | 'oak'
  | 'walnut'
  | 'anthracite'
  | 'black'
  | 'fabricGrey'
  | 'fabricBlue'
  | 'fabricBeige'
  | 'fabricGreen'
  | 'leather'
  | 'metal'
  | 'steel'
  | 'glass'
  | 'ceramic'
  | 'worktop'
  | 'mattress'
  | 'plant'
  | 'soil'
  | 'lamp'
  | 'rug'
  | 'screen'
  | 'mirror'
  | 'floor'
  | 'wall';

interface Finish {
  color: string;
  opacity?: number;
  /** a texture of the app (holz, stoff, parkett …) */
  texture?: string;
  size?: number;
}

export const FINISHES: Record<MaterialId, Finish> = {
  white: { color: '#f1efe9' },
  oak: { color: '#c9a477', texture: 'holz', size: 0.6 },
  walnut: { color: '#7b5537', texture: 'holz', size: 0.6 },
  anthracite: { color: '#41454c' },
  black: { color: '#26282b' },
  fabricGrey: { color: '#8e949b', texture: 'stoff', size: 0.3 },
  fabricBlue: { color: '#4f6c8e', texture: 'stoff', size: 0.3 },
  fabricBeige: { color: '#cbb99a', texture: 'stoff', size: 0.3 },
  fabricGreen: { color: '#5d7a5a', texture: 'stoff', size: 0.3 },
  leather: { color: '#7a4a2e' },
  metal: { color: '#9aa1a8' },
  steel: { color: '#c7ccd1', texture: 'metall', size: 0.5 },
  glass: { color: '#bfe1ec', opacity: 0.35 },
  ceramic: { color: '#fbfbfa' },
  worktop: { color: '#b8a27f' },
  mattress: { color: '#f3f1ec' },
  plant: { color: '#4d8a4a' },
  soil: { color: '#5a4636' },
  lamp: { color: '#fff4d6' },
  rug: { color: '#b49e86', texture: 'stoff', size: 0.4 },
  screen: { color: '#121417' },
  mirror: { color: '#dfe8ec' },
  floor: { color: '#c8a77c', texture: 'parkett', size: 1.2 },
  wall: { color: '#f4f2ee' },
};

/** finishes offered for cabinets and tables, and for upholstery */
export const WOOD_FINISHES: MaterialId[] = ['white', 'oak', 'walnut', 'anthracite', 'black'];
export const FABRICS: MaterialId[] = ['fabricGrey', 'fabricBlue', 'fabricBeige', 'fabricGreen', 'leather'];

export const materialName = (id: MaterialId) => t(`roomplanner.materials.${id}`);
