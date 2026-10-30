/** the example the panel opens in the script editor – everything the plugin adds to s3d, in one landscape */
// i18n-ignore-start – script code (names are model content)
export const EXAMPLE = `// An island from noise, woods and rocks on it, a roughened boulder and a field of posts
const island = s3d.noiseTerrain({
  width: 80, depth: 60, height: 10, scale: 22, octaves: 6,
  falloff: 1, water: 1.2, seed: 7,
});
s3d.scatter({ on: island, objects: ['conifer', 'tree'], spacing: 3.5, clumping: 0.75, maxSlope: 28, seed: 2 });
s3d.scatter({ on: island, objects: ['rock', 'bush'], spacing: 5, density: 0.4, seed: 9 });

// a box turned into a boulder
const boulder = s3d.box([-6, -6, 0], 3, 2, 1.6);
s3d.noiseDeform({ target: boulder, amount: 0.35, scale: 1.2, detail: 0.25 });

// s3d.noise / s3d.fbm as numbers: posts whose height follows the noise
for (let x = 0; x < 10; x++) {
  for (let y = 0; y < 4; y++) {
    const height = 0.3 + 1.5 * s3d.fbm(x / 4, y / 4, { octaves: 3, mode: 'billow' });
    s3d.box([-20 + x * 0.6, -6 + y * 0.6, 0], 0.4, 0.4, height);
  }
}
`;
// i18n-ignore-end
