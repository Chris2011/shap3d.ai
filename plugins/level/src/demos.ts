import arenaDemo from '../docs/demo.js?raw';
import blockoutDemo from '../docs/demo-blockout.js?raw';
import enemiesDemo from '../docs/demo-enemies.js?raw';
import generateDemo from '../docs/demo-generate.js?raw';
import nightDemo from '../docs/demo-night.js?raw';
import storeysDemo from '../docs/demo-storeys.js?raw';

/**
 * The demos in docs/ as examples in the script editor (under the plugin's name, for JavaScript) – the same scripts
 * the screenshots are made with. Each one clears the model first.
 */

export const DEMOS = [
  { id: 'arena', code: arenaDemo },
  { id: 'blockout', code: blockoutDemo },
  { id: 'enemies', code: enemiesDemo },
  { id: 'generate', code: generateDemo },
  { id: 'night', code: nightDemo },
  { id: 'storeys', code: storeysDemo },
];
