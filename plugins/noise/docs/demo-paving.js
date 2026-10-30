// Demo for the stones screenshot (npm run screenshots): flagstones, cobbles and slabs laid on areas, and a dry
// stone wall laid on a selected wall face – all from cellular noise (s3d.paving).
s3d.clear();
s3d.editor.model.name = 'Stones';

s3d.paving({ area: [0, 0, 5, 4], size: 0.55, gap: 0.02, thickness: 0.05, variation: 0.25, bevel: 0.008, color: '#a39a8c', joint: true, seed: 3 });
s3d.paving({ area: [5.4, 0, 8.8, 4], size: 0.16, gap: 0.012, jitter: 0.55, thickness: 0.08, variation: 0.35, bevel: 0.025, color: '#8c8f94', joint: true, seed: 5 });
s3d.paving({ area: [9.2, 0, 14.2, 4], size: 0.9, gap: 0.008, jitter: 0.35, stretch: 1.4, thickness: 0.04, variation: 0.08, bevel: 0.003, color: '#c9b79a', joint: true, seed: 7 });

// a wall face behind them, facing the camera – the stones are laid on it
const wall = s3d.face([
  [0, 4.6, 0],
  [14.2, 4.6, 0],
  [14.2, 4.6, 1.8],
  [0, 4.6, 1.8],
]);
s3d.editor.select([{ kind: 'face', id: wall.id }]);
s3d.paving({ size: 0.28, gap: 0.015, jitter: 0.8, stretch: 2.2, thickness: 0.12, variation: 0.5, bevel: 0.03, color: '#9b8f7d', joint: true, seed: 11 });
s3d.editor.select([]);
