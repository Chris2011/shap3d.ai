import playgroundDemo from '../docs/demo.js?raw';
import craneDemo from '../docs/demo-crane.js?raw';
import flightDemo from '../docs/demo-flight.js?raw';
import liquidDemo from '../docs/demo-liquid.js?raw';
import machinesDemo from '../docs/demo-machines.js?raw';
import robotDemo from '../docs/demo-robot.js?raw';
import tunnelDemo from '../docs/demo-tunnel.js?raw';
import waterDemo from '../docs/demo-water.js?raw';

/**
 * The demos in docs/ as examples in the script editor (under the plugin's name, for JavaScript) – the same scripts
 * the screenshots are made with. Each one clears the model first and starts the simulation.
 */

export const DEMOS = [
  { id: 'playground', code: playgroundDemo },
  { id: 'robot', code: robotDemo },
  { id: 'machines', code: machinesDemo },
  { id: 'crane', code: craneDemo },
  { id: 'flight', code: flightDemo },
  { id: 'water', code: waterDemo },
  { id: 'liquid', code: liquidDemo },
  { id: 'tunnel', code: tunnelDemo },
];
