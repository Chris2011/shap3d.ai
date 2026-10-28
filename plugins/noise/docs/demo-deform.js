// Demo for the deform screenshot (npm run screenshots): boxes twisted, tapered, bent and roughened by noise
// (s3d.noiseDeform), and two blocks with the plugin's material shaders (noise and cells).
s3d.clear();
s3d.editor.model.name = 'Deform';
s3d.material('Beton', '#b8b4ac');
s3d.material('Sandstein', '#c8a878');

const tower = s3d.box([0, 0, 0], 1.2, 1.2, 6, { material: 'Beton' });
s3d.noiseDeform({ target: tower, amount: 0, detail: 0.3, twist: 120, taper: 0.55 });

const column = s3d.box([3, 0, 0], 0.8, 0.8, 5, { material: 'Sandstein' });
s3d.noiseDeform({ target: column, amount: 0.04, scale: 0.5, detail: 0.2, bend: 50 });

const spiral = s3d.box([6.5, 0, 0], 1.6, 0.4, 5, { material: 'Beton' });
s3d.noiseDeform({ target: spiral, amount: 0, detail: 0.2, twist: 270 });

const boulder = s3d.box([9.5, -0.5, 0], 2.4, 2, 1.6, { material: 'Sandstein' });
s3d.noiseDeform({ target: boulder, amount: 0.22, scale: 1.6, detail: 0.15, octaves: 3, seed: 4 });

// the material shaders
s3d.material('Moos', '#6f8f3a', { shader: 'noise.noise', params: { color2: '#2f3a2c', mode: 1, contrast: 1.6 } });
s3d.material('Zellen', '#a39a8c', { shader: 'noise.cells', params: { joint: 0.08, variation: 0.3 } });
s3d.box([13, 0, 0], 1.6, 1.6, 1.6, { material: 'Moos' });
s3d.box([15.4, 0, 0], 1.6, 1.6, 1.6, { material: 'Zellen' });

s3d.editor.select([{ kind: 'instance', id: boulder.inst.id }]);
