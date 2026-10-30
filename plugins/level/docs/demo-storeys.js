// Demo for rooms above each other (npm run screenshots): a hall on the ground floor, stairs inside it up to a gallery
// that lies over its back half, and a key up there – the walking grid shows both floors reached from the start.
s3d.clear();
s3d.editor.model.name = 'Two storeys';
s3d.levelBlock('room', { x: 0, y: 0, width: 12, depth: 6, height: 3 });
s3d.levelBlock('stairs', { x: 4, y: 0, width: 4, depth: 2, rise: 3, direction: '+x', height: 3 });
s3d.levelBlock('room', { x: 8, y: 0, width: 4, depth: 6, floor: 3, height: 3 });
s3d.levelObject('spawn', { at: [2, 4, 0], props: { team: 'player' }, name: 'Start' });
s3d.levelObject('pickup', { at: [10, 4, 3], props: { item: 'gallery-key' }, name: 'Gallery key' });
s3d.levelObject('pickup', { at: [10, 4, 0], props: { item: 'health', amount: 25 }, name: 'Health below' });
s3d.editor.select([]);
