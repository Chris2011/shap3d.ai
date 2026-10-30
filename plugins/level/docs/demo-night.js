// Demo for the light and atmosphere screenshots (npm run screenshots): the blocked-out mansion at night – ceilings,
// almost no daylight and a little fog – lit by a flickering lamp in the hall, a spot over the stairs, a cold light in
// the library and a corridor light that a trigger switches on; the lamp and the spot cast shadows. In the test run the player's torch is on.
s3d.clear();
s3d.editor.model.name = 'Mansion at night';
s3d.levelBlock('room', { x: 0, y: 0, width: 10, depth: 8, height: 4, ceiling: true });
s3d.levelBlock('room', { x: -7, y: 0, width: 7, depth: 6, height: 3, ceiling: true });
s3d.levelBlock('corridor', { from: [10, 4], to: [18, 13], width: 2, height: 3, ceiling: true });
s3d.levelBlock('room', { x: 15, y: 13, width: 7, depth: 6, height: 3.5, ceiling: true });
s3d.levelBlock('stairs', { x: 3, y: 8, width: 2, depth: 4, rise: 3, direction: '+y', height: 3, ceiling: true });
s3d.levelBlock('room', { x: 0, y: 12, width: 9, depth: 5, floor: 3, height: 3, ceiling: true });
s3d.levelAtmosphere({ daylight: 0.05, fog: true, fogColor: '#1c2026', fogNear: 3, fogFar: 22, preview: true });

s3d.levelObject('spawn', { at: [5, 2, 0], rotation: 90, props: { team: 'player' }, name: 'Start' });
s3d.levelObject('door', { at: [0, 3, 0], props: { locked: true, key: 'library-key' }, name: 'West door' });
s3d.levelObject('light', {
  at: [5, 4, 3.7],
  props: { color: '#ffc078', intensity: 1.4, range: 9, flicker: true, shadows: true },
  name: 'Hall lamp',
});
s3d.levelObject('light', {
  at: [4, 11, 5.6],
  props: { type: 'spot', color: '#ffe8cc', intensity: 2, range: 9, angle: 30, pitch: -75, shadows: true },
  rotation: -90,
  name: 'Stair spot',
});
s3d.levelObject('light', { at: [18.5, 16, 3.2], props: { color: '#8ce99a', intensity: 0.9, range: 7 }, name: 'Library light' });
s3d.levelObject('light', { at: [17.5, 8, 2.7], props: { color: '#ffd8a8', intensity: 1, range: 7, on: false }, name: 'Corridor light' });
s3d.levelObject('pickup', { at: [19, 17, 0], props: { item: 'library-key' }, name: 'Library key' });
s3d.levelObject('camera', { at: [9.5, 0.5, 3.6], rotation: 140, props: { pitch: -30, fov: 60, start: true }, name: 'Cam hall' });
s3d.levelObject('trigger', {
  at: [14, 4, 0],
  size: [2, 2, 3],
  actions: [
    { do: 'enable', target: 'light-4' },
    { do: 'sound', value: 'light-switch' },
  ],
  name: 'Corridor entry',
});
s3d.editor.select([]);
