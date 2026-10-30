// Demo for the blockout screenshot (npm run screenshots): a mansion blocked out on the grid – a hall with stairs up to
// a gallery room, a west room behind a locked door, a corridor that bends towards the library – and the game objects:
// the player's start, the key in the library, a trigger in the corridor that switches the camera and wakes the
// enemy in the west room, a save point.
s3d.clear();
s3d.editor.model.name = 'Mansion blockout';
s3d.levelBlock('room', { x: 0, y: 0, width: 10, depth: 8, height: 4 });
s3d.levelBlock('room', { x: -7, y: 0, width: 7, depth: 6, height: 3 });
s3d.levelBlock('corridor', { from: [10, 4], to: [18, 13], width: 2, height: 3 });
s3d.levelBlock('room', { x: 15, y: 13, width: 7, depth: 6, height: 3.5 });
s3d.levelBlock('stairs', { x: 3, y: 8, width: 2, depth: 4, rise: 3, direction: '+y', height: 3 });
s3d.levelBlock('room', { x: 0, y: 12, width: 9, depth: 5, floor: 3, height: 3 });

s3d.levelObject('spawn', { at: [5, 2, 0], rotation: 90, props: { team: 'player' }, name: 'Start' });
s3d.levelObject('door', { at: [0, 3, 0], props: { locked: true, key: 'library-key' }, name: 'West door' });
s3d.levelObject('enemy', { at: [-4, 3, 0], rotation: 0, props: { type: 'zombie', when: 'action' }, name: 'Sleeper' });
s3d.levelObject('pickup', {
  at: [19, 17, 0],
  props: { item: 'library-key' },
  actions: [{ do: 'message', value: 'A small brass key.' }],
  name: 'Library key',
});
s3d.levelObject('camera', { at: [9.5, 0.5, 3.6], rotation: 140, props: { pitch: -30, fov: 60, start: true }, name: 'Cam hall' });
s3d.levelObject('camera', { at: [17.5, 5, 2.7], rotation: 90, props: { pitch: -20, fov: 55 }, name: 'Cam corridor' });
s3d.levelObject('trigger', {
  at: [14, 4, 0],
  size: [2, 2, 3],
  actions: [
    { do: 'camera', target: 'camera-2' },
    { do: 'spawn', target: 'enemy-1' },
  ],
  name: 'Corridor entry',
});
s3d.levelObject('savepoint', { at: [8.5, 15.5, 3], rotation: 180, props: { label: 'Typewriter' }, name: 'Gallery save' });
s3d.editor.select([]);
