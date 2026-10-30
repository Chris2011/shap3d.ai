// Demo for the enemies of the test run: a hall with a pillar, a guard that patrols four waypoints and a sleeper
// that wakes when the player walks into the trigger by the door.
s3d.clear();
s3d.editor.model.name = 'Patrol';
s3d.levelBlock('room', { x: 0, y: 0, width: 16, depth: 12, height: 4 });
s3d.levelBlock('room', { x: 7, y: 5, width: 2, depth: 2, height: 4 });
s3d.levelObject('spawn', { at: [2, 2, 0], rotation: 45, props: { team: 'player' }, name: 'Start' });
[
  [3, 9],
  [13, 9],
  [13, 3],
  [5, 3],
].forEach(([x, y], index) =>
  s3d.levelObject('waypoint', {
    at: [x, y, 0],
    props: { path: 'guard', order: index + 1, wait: index === 1 ? 1.5 : 0 },
    name: `Guard ${index + 1}`,
  }),
);
s3d.levelObject('enemy', { at: [3, 9, 0], props: { type: 'guard', path: 'guard' }, name: 'Guard' });
s3d.levelObject('enemy', { at: [14, 10.5, 0], rotation: 180, props: { type: 'zombie', count: 2, when: 'action' }, name: 'Sleepers' });
s3d.levelObject('trigger', { at: [12, 2, 0], size: [3, 3, 3], actions: [{ do: 'spawn', target: 'enemy-2' }], name: 'Wake' });
s3d.editor.select([]);
