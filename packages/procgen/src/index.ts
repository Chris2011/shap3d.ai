// Procedural generation for Shap3D.ai – pure, seeded generators shared by plugins at build time.
// Every function here is deterministic (the same seed and options give the same result) and knows nothing of the
// editor, the plugin context or Vue: data in, data or meshes out. Texts and material names come from the caller.
export * from './blockout';
export * from './builder';
export * from './city';
export * from './cityground';
export * from './erosion';
export * from './errors';
export * from './facade';
export * from './floorplan';
export * from './junctions';
export * from './mesh';
export * from './noise';
export * from './paving';
export * from './routes';
export * from './terrain';
export * from './tree';
export * from './village';
