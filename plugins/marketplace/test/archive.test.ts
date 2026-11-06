import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGlb, gltfToGlb, joinPath, LoadError, openZip, pickModel, prepareModel } from '../src/archive.ts';

const encoder = new TextEncoder();
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
const code = (name: string) => (error: unknown) => error instanceof LoadError && error.code === name;

/** a zip from (name, bytes, stored or deflated) */
const makeZip = async (files: [string, Uint8Array, boolean?][]) => {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, bytes, deflate] of files) {
    const packed = deflate ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const entry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    locals.push(local, packed);
    central.push(entry);
    offset += local.length + packed.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...locals, ...central, end] as BlobPart[]).arrayBuffer());
};

const readGlbJson = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
};

test('paths cannot leave the root', () => {
  assert.equal(joinPath('a/b', '../c.bin'), 'a/c.bin');
  assert.equal(joinPath('', '../../etc/passwd'), undefined);
  assert.equal(joinPath('', 'a\\b.png'), 'a/b.png');
});

test('a glTF with parts becomes one GLB with all bytes in place', async () => {
  const buffer = Uint8Array.from([1, 2, 3, 4, 5]);
  const gltf = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'mesh%20a.bin', byteLength: 5 }],
    bufferViews: [{ buffer: 0, byteOffset: 1, byteLength: 4 }],
    images: [{ uri: '../tex/a.png' }],
  });
  const parts: Record<string, Uint8Array> = { 'model/mesh a.bin': buffer, 'tex/a.png': PNG };
  const glb = await gltfToGlb(gltf, 'model', async (path) => parts[path]);
  checkGlb(glb);
  const json = readGlbJson(glb);
  assert.equal(json.images[0].uri, undefined);
  assert.equal(json.images[0].mimeType, 'image/png');
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].uri, undefined);
  const view = new DataView(glb.buffer);
  const binary = 20 + view.getUint32(12, true);
  assert.equal(view.getUint32(8, true), glb.length);
  assert.equal(view.getUint32(binary + 4, true), 0x004e4942);
  const start = binary + 8;
  assert.equal(glb[start + json.bufferViews[0].byteOffset], 2);
  const image = json.bufferViews[json.images[0].bufferView];
  assert.deepEqual([...glb.subarray(start + image.byteOffset, start + image.byteOffset + image.byteLength)], [...PNG]);
});

test('addresses in a file are not followed', async () => {
  const remote = JSON.stringify({ buffers: [{ uri: 'https://evil.example/x.bin' }] });
  await assert.rejects(gltfToGlb(remote, '', async () => PNG), code('remote'));
  const escaping = JSON.stringify({ buffers: [{ uri: '../../x.bin' }] });
  await assert.rejects(gltfToGlb(escaping, '', async () => PNG), code('missingPart'));
  const glb = await gltfToGlb(JSON.stringify({ images: [{ bufferView: 0 }] }), '', async () => PNG);
  checkGlb(glb);
});

test('compressed glTF is named, not a cryptic loader error', async () => {
  const draco = JSON.stringify({ extensionsRequired: ['KHR_draco_mesh_compression'] });
  await assert.rejects(gltfToGlb(draco, '', async () => PNG), code('compressed'));
});

test('zip: stored and deflated entries, model picked, bomb stopped', async () => {
  const text = encoder.encode('hello hello hello hello');
  const zip = await makeZip([
    ['__MACOSX/x.glb', text],
    ['a/readme.txt', text, true],
    ['a/small.stl', text],
    ['a/big.stl', encoder.encode('much bigger than the other one, really')],
    ['../evil.stl', text],
  ]);
  const opened = openZip(zip, 1000);
  assert.equal(pickModel(opened.entries), 'a/big.stl');
  assert.deepEqual(await opened.read('a/readme.txt'), text);
  assert.equal(opened.entries.has('evil.stl') || opened.entries.has('../evil.stl'), false);
  const limited = openZip(zip, 10);
  await assert.rejects(limited.read('a/readme.txt'), code('tooLarge'));
});

test('prepareModel unpacks a zipped glTF with its parts', async () => {
  const gltf = encoder.encode(JSON.stringify({ buffers: [{ uri: 'scene.bin' }], bufferViews: [] }));
  const zip = await makeZip([
    ['scene.gltf', gltf, true],
    ['scene.bin', Uint8Array.from([9, 9, 9, 9]), true],
  ]);
  const { extension, bytes } = await prepareModel('model.zip', async () => zip, 1000);
  assert.equal(extension, 'glb');
  checkGlb(bytes);
  const empty = await makeZip([['notes.txt', gltf]]);
  await assert.rejects(prepareModel('model.zip', async () => empty, 1000), code('noModel'));
});
