import showcaseDemo from '../docs/demo.js?raw';
import cameraDemo from '../docs/demo-camera.js?raw';
import colorsDemo from '../docs/demo-colors.js?raw';
import puppetDemo from '../docs/demo-puppet.js?raw';
import robotDemo from '../docs/demo-robot.js?raw';

/**
 * The demos in docs/ as examples in the script editor (under the plugin's name, for JavaScript) – the same scripts
 * the screenshots are made with. Each one clears the model and its animation first.
 */

export const DEMOS = [
  { id: 'showcase', code: showcaseDemo },
  { id: 'robot', code: robotDemo },
  { id: 'puppet', code: puppetDemo },
  { id: 'camera', code: cameraDemo },
  { id: 'colors', code: colorsDemo },
];
