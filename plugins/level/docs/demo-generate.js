// Demo for the floor plan screenshot (npm run screenshots): a level generated from a seed – ten rooms linked by
// corridors, with the player's start, a light in every room, enemies, health, a save point and the goal.
s3d.clear();
s3d.editor.model.name = 'Generated level';
s3d.levelGenerate({ seed: 12, rooms: 10, size: 50, height: 3 });
s3d.editor.select([]);
