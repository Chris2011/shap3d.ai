import type { PluginContext } from '../../../src/plugins/types';
import { t } from './i18n';

export type Unit = 'mm' | 'cm' | 'm';
export type Backend = 'manifold' | 'cgal';

/** what the user chooses in the panel – kept in the plugin's storage */
export interface Settings {
  unit: Unit;
  backend: Backend;
}

export const UNITS: Unit[] = ['mm', 'cm', 'm'];
const UNIT_SCALE: Record<Unit, number> = { mm: 0.001, cm: 0.01, m: 1 };

/** "Millimetres" … in the current language */
export const unitLabel = (unit: Unit) => t(`openscad.units.${unit}`);

export const loadSettings = (context: PluginContext): Settings =>
  context.storage.get<Settings>('settings', { unit: 'mm', backend: 'manifold' });

/** factor from OpenSCAD units to metres */
export const scaleOf = (settings: Settings) => UNIT_SCALE[settings.unit] ?? 0.001;
