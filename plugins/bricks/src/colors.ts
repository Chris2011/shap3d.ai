import { pluginContext, t } from './runtime';

/** The colours bricks can have: plain names, each a material of the model made on first use. */
export interface BrickColor {
  id: string;
  hex: string;
  opacity?: number;
}

export const COLORS: BrickColor[] = [
  { id: 'white', hex: '#f4f4f0' },
  { id: 'lightGrey', hex: '#a3a5a8' },
  { id: 'darkGrey', hex: '#62666b' },
  { id: 'black', hex: '#1d1f22' },
  { id: 'red', hex: '#c8222a' },
  { id: 'darkRed', hex: '#7c1c1f' },
  { id: 'orange', hex: '#ee7b1a' },
  { id: 'yellow', hex: '#f7c81f' },
  { id: 'lime', hex: '#a2c22c' },
  { id: 'green', hex: '#23823f' },
  { id: 'lightBlue', hex: '#5aa7dd' },
  { id: 'blue', hex: '#1b55ad' },
  { id: 'darkBlue', hex: '#17305c' },
  { id: 'pink', hex: '#ea8fb7' },
  { id: 'purple', hex: '#6a3a98' },
  { id: 'tan', hex: '#d9bd86' },
  { id: 'brown', hex: '#5e3a21' },
  { id: 'clear', hex: '#bcdcec', opacity: 0.45 },
];

export const DEFAULT_COLOR = 'red';

/** a colour a model file names: "#rrggbb", with two more digits when it lets light through */
const spelledOut = (id: string): BrickColor | undefined => {
  const found = /^(#[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(id);
  return found ? { id, hex: found[1], ...(found[2] ? { opacity: parseInt(found[2], 16) / 255 } : {}) } : undefined;
};

/** a colour by what is stored; a model file comes from anywhere, so anything else is the default colour */
export const colorById = (id: string): BrickColor =>
  COLORS.find((color) => color.id === id) ?? spelledOut(id) ?? COLORS.find((color) => color.id === DEFAULT_COLOR)!;

const isOwnColor = (id: string) => COLORS.some((color) => color.id === id);

export const colorName = (id: string) => {
  const color = colorById(id);
  return isOwnColor(color.id) ? t(`bricks.colors.${color.id}`) : color.id;
};

/** the model's material of a colour; call inside an undo step */
export const ensureColorMaterial = (id: string) => {
  const color = colorById(id);
  return pluginContext().materials.ensure(t('bricks.materialName', { color: colorName(color.id) }), {
    color: color.hex,
    opacity: color.opacity ?? 1,
  });
};
