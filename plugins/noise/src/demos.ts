import islandDemo from '../docs/demo.js?raw';
import treesDemo from '../docs/demo-trees.js?raw';
import scatterDemo from '../docs/demo-scatter.js?raw';
import pavingDemo from '../docs/demo-paving.js?raw';
import routesDemo from '../docs/demo-routes.js?raw';
import junctionsDemo from '../docs/demo-junctions.js?raw';
import cityroadsDemo from '../docs/demo-cityroads.js?raw';
import villagesDemo from '../docs/demo-villages.js?raw';
import erosionDemo from '../docs/demo-erosion.js?raw';
import facadeDemo from '../docs/demo-facade.js?raw';
import cityDemo from '../docs/demo-city.js?raw';
import hillcityDemo from '../docs/demo-hillcity.js?raw';
import deformDemo from '../docs/demo-deform.js?raw';

/**
 * The demos in docs/ as examples in the script editor (under the plugin's name, for JavaScript) – the same scripts
 * the screenshots are made with. Each one clears the model first.
 */

export const DEMOS = [
  { id: 'island', code: islandDemo },
  { id: 'trees', code: treesDemo },
  { id: 'scatter', code: scatterDemo },
  { id: 'paving', code: pavingDemo },
  { id: 'routes', code: routesDemo },
  { id: 'junctions', code: junctionsDemo },
  { id: 'cityroads', code: cityroadsDemo },
  { id: 'villages', code: villagesDemo },
  { id: 'erosion', code: erosionDemo },
  { id: 'facade', code: facadeDemo },
  { id: 'city', code: cityDemo },
  { id: 'hillcity', code: hillcityDemo },
  { id: 'deform', code: deformDemo },
];
