import type * as THREE from 'three';
import type { Instance } from '../../../src/core/model';
import { pluginContext } from './runtime';
import { classify, gridIndex, makeGrid, type TerrainSettings } from './terrain';

/**
 * The live preview: the noise terrain as a plain three.js mesh among the viewport's helpers, coloured by the
 * same rules the real faces get. Nothing goes into the model until "Create" – then the panel runs the script.
 * While an existing noise terrain is being changed, it is hidden behind its preview.
 */

const COLOURS = { grass: '#6fa347', earth: '#8a6342', rock: '#9a968e', snow: '#f3f6f9' };

let mesh: THREE.Mesh | null = null;
let water: THREE.Mesh | null = null;
let hidden: Instance | null = null;

const remove = () => {
  const { editor } = pluginContext();
  for (const object of [mesh, water]) {
    if (object) {
      editor.viewer.helpers.remove(object);
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  }
  mesh = null;
  water = null;
};

/** shows the terrain the settings make, with its corner at `origin` (world); hides `replacing` meanwhile */
export const showPreview = (settings: TerrainSettings, origin: THREE.Vector3, replacing: Instance | null) => {
  const { editor, THREE } = pluginContext();
  remove();
  const swapped = hidden !== replacing;
  if (swapped) {
    if (hidden) {
      hidden.hidden = false;
    }
    hidden = replacing;
    if (hidden) {
      hidden.hidden = true;
    }
  }
  const grid = makeGrid(settings);
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const positions: number[] = [];
  for (let row = 0; row <= grid.rows; row++) {
    for (let column = 0; column <= grid.columns; column++) {
      positions.push(column * cellX, row * cellY, grid.heights[gridIndex(grid, column, row)]);
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const corner00 = gridIndex(grid, column, row),
        corner10 = gridIndex(grid, column + 1, row),
        corner01 = gridIndex(grid, column, row + 1),
        corner11 = gridIndex(grid, column + 1, row + 1);
      if ((column + row) % 2 === 0) {
        indices.push(corner00, corner10, corner11, corner00, corner11, corner01);
      } else {
        indices.push(corner00, corner10, corner01, corner10, corner11, corner01);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // colour per point by its height and slope (the faces get theirs per triangle – close enough to judge)
  const normals = geometry.getAttribute('normal');
  const colours: number[] = [];
  const colour = new THREE.Color();
  for (let index = 0; index < normals.count; index++) {
    const slope = (Math.acos(Math.min(1, Math.abs(normals.getZ(index)))) * 180) / Math.PI;
    colour.set(COLOURS[classify(grid.layers, positions[index * 3 + 2], slope)]);
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  mesh.position.copy(origin);
  editor.viewer.helpers.add(mesh);
  if (grid.water != null) {
    water = new THREE.Mesh(
      new THREE.PlaneGeometry(grid.width, grid.depth),
      new THREE.MeshLambertMaterial({ color: '#3f7fae', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    water.position.set(origin.x + grid.width / 2, origin.y + grid.depth / 2, origin.z + grid.water);
    editor.viewer.helpers.add(water);
  }
  // hiding a group rebuilds the scene, a new preview only needs a new picture
  if (swapped) {
    editor.invalidate();
  } else {
    editor.redraw();
  }
  return grid;
};

/** removes the preview and shows a hidden terrain again */
export const hidePreview = () => {
  remove();
  if (hidden) {
    hidden.hidden = false;
    hidden = null;
  }
  pluginContext().editor.invalidate();
};
