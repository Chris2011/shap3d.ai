// Demo for the level editor screenshot (npm run screenshots): an arena on a grass field with spawn points for two
// teams, a flag and health pickups, a jump pad onto the platform, two teleporters and a patrol path – and next to it
// a house in the style of a survival horror game: a locked door whose key lies in the arena, a trigger behind the
// door that switches the fixed camera and lets enemies come, a save point, a hazard and a sound zone.
s3d.clear();
s3d.editor.model.name = 'Arena and house';
s3d.terrain([-20, -15, 0], 58, 30, { hills: 0, seed: 4 });
s3d.material('Arena stone', '#b9b2a6');
s3d.material('House plaster', '#8f8577');
const wall = (x0, y0, x1, y1, height = 2.4, material = 'Arena stone') => s3d.box([x0, y0, 0], x1 - x0, y1 - y0, height, { material });

// the arena
wall(-12, -8, 12, -7.4);
wall(-12, 7.4, 12, 8);
wall(-12, -7.4, -11.4, 7.4);
wall(11.4, -7.4, 12, -1.5);
wall(11.4, 1.5, 12, 7.4);
s3d.box([-3, -2, 0], 6, 4, 1.5, { material: 'Arena stone' });
s3d.levelObject('spawn', { at: [-9, -4, 0], props: { team: 'red' }, name: 'Red 1' });
s3d.levelObject('spawn', { at: [-9, 4, 0], props: { team: 'red' }, name: 'Red 2' });
s3d.levelObject('spawn', { at: [9, -4, 0], rotation: 180, props: { team: 'blue' }, name: 'Blue 1' });
s3d.levelObject('spawn', { at: [9, 4, 0], rotation: 180, props: { team: 'blue' }, name: 'Blue 2' });
s3d.levelObject('pickup', { at: [0, 0, 1.5], props: { item: 'flag', amount: 1, respawn: 30 }, name: 'Flag' });
s3d.levelObject('pickup', { at: [-5, 5.5, 0], props: { item: 'health', amount: 25, respawn: 15 }, name: 'Health west' });
s3d.levelObject('jumppad', { at: [-5, 0, 0], props: { height: 3, distance: 4 }, name: 'Jump pad' });
s3d.levelObject('teleporter', { at: [-9, 0, 0], props: { target: 'teleporter-2' }, name: 'Gate west' });
s3d.levelObject('teleporter', { at: [8, 0, 0], props: { target: 'teleporter-1' }, name: 'Gate east' });
[
  [-6, -5.5],
  [6, -5.5],
  [6, 5.5],
  [-6, 5.5],
].forEach(([x, y], index) =>
  s3d.levelObject('waypoint', {
    at: [x, y, 0],
    rotation: index * 90,
    props: { path: 'patrol', order: index + 1, wait: 2 },
    name: `Patrol ${index + 1}`,
  }),
);
// the key to the house, lying in the arena: picking it up shows a message
s3d.levelObject('pickup', {
  at: [5, -5.5, 0],
  props: { item: 'mansion-key', amount: 1 },
  actions: [{ do: 'message', value: 'You found an old key.' }],
  name: 'Mansion key',
});

// the house: walls with a gap for the door
wall(20, -6, 34, -5.6, 3, 'House plaster');
wall(20, 5.6, 34, 6, 3, 'House plaster');
wall(33.6, -5.6, 34, 5.6, 3, 'House plaster');
wall(20, -5.6, 20.4, -0.6, 3, 'House plaster');
wall(20, 0.6, 20.4, 5.6, 3, 'House plaster');
s3d.levelObject('door', { at: [20.2, 0, 0], props: { locked: true, key: 'mansion-key' }, name: 'Front door' });
s3d.levelObject('camera', { at: [16, -4, 2.8], rotation: 45, props: { pitch: -15, fov: 55, start: true }, name: 'Cam outside' });
s3d.levelObject('camera', { at: [33, 5, 2.6], rotation: -150, props: { pitch: -30, fov: 60 }, name: 'Cam hall' });
s3d.levelObject('enemy', { at: [31, -3, 0], rotation: 160, props: { type: 'zombie', count: 2, when: 'action' }, name: 'Zombies' });
s3d.levelObject('trigger', {
  at: [23, 0, 0],
  size: [3, 4, 2.6],
  props: { on: 'enter', once: true },
  actions: [
    { do: 'camera', target: 'camera-2' },
    { do: 'spawn', target: 'enemy-1' },
    { do: 'sound', value: 'door-slam' },
  ],
  name: 'Hall entry',
});
s3d.levelObject('savepoint', { at: [32.5, -4.5, 0], rotation: 180, props: { label: 'Typewriter' }, name: 'Save' });
s3d.levelObject('hazard', { at: [28, 3.5, 0], size: [2, 2, 0.4], props: { damage: 5 }, name: 'Broken glass' });
s3d.levelObject('soundzone', {
  at: [27, 0, 0],
  size: [13, 11, 3],
  props: { sound: 'house-ambience', reverb: 'room' },
  name: 'House sound',
});
s3d.editor.select([]);
