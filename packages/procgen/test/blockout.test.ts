import { describe, expect, it } from 'vitest';
import { blockoutFloorAt, blockoutMesh, pieceRects, type BlockPiece } from '../src';
import { expectValidMesh } from './helpers';

const MATERIALS = { floor: 'floor', wall: 'wall', ceiling: 'ceiling', stairs: 'stairs' };

/** the faces of a material with their corners */
const facesOf = (pieces: BlockPiece[], material: string, doorways = []) => {
  const mesh = blockoutMesh(pieces, 0.5, MATERIALS, doorways);
  expectValidMesh(mesh);
  return mesh.faces
    .filter((_, index) => mesh.faceMaterials![index] === material)
    .map((face) => face.map((corner) => mesh.vertices[corner]));
};

/** the area of a flat polygon (any orientation) */
const area = (points: number[][]) => {
  const normal = [0, 0, 0];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    normal[0] += (point[1] - next[1]) * (point[2] + next[2]);
    normal[1] += (point[2] - next[2]) * (point[0] + next[0]);
    normal[2] += (point[0] - next[0]) * (point[1] + next[1]);
  });
  return Math.hypot(...normal) / 2;
};
const total = (faces: number[][][]) => faces.reduce((sum, face) => sum + area(face), 0);

const room = (x: number, y: number, width: number, depth: number, extra: Partial<BlockPiece> = {}): BlockPiece =>
  ({ kind: 'room', x, y, width, depth, floor: 0, height: 3, ...extra }) as BlockPiece;

describe('blockout', () => {
  it('closes a room with four walls, a floor and – when asked – a ceiling', () => {
    const pieces = [room(0, 0, 4, 3, { ceiling: true })];
    expect(total(facesOf(pieces, 'floor'))).toBeCloseTo(12, 6);
    expect(total(facesOf(pieces, 'ceiling'))).toBeCloseTo(12, 6);
    // perimeter 14 m × 3 m
    expect(total(facesOf(pieces, 'wall'))).toBeCloseTo(42, 6);
    // the floor is one rectangle, each wall one face
    expect(facesOf(pieces, 'floor')).toHaveLength(1);
    expect(facesOf(pieces, 'wall')).toHaveLength(4);
  });

  it('keeps a room on the floor above another – both floors, both sets of walls, no ceiling under the upper floor', () => {
    const pieces = [room(0, 0, 4, 3, { ceiling: true }), room(0, 0, 4, 3, { floor: 3, ceiling: true })];
    const floors = facesOf(pieces, 'floor');
    expect(floors).toHaveLength(2);
    expect(floors.map((face) => face[0][2]).sort()).toEqual([0, 3]);
    // the lower room's ceiling is the upper room's floor – only the top one stays
    const ceilings = facesOf(pieces, 'ceiling');
    expect(ceilings).toHaveLength(1);
    expect(ceilings[0][0][2]).toBe(6);
    // perimeter 14 m, 6 m high in all
    expect(total(facesOf(pieces, 'wall'))).toBeCloseTo(14 * 6, 6);
  });

  it('builds a room on an upper floor over empty cells next to stairs – its floor whole', () => {
    // the upper room (8 × 3, floor at 3 m) lies beside the lower room and the stairs, over empty cells
    const pieces: BlockPiece[] = [
      room(0, 0, 4, 3),
      room(0, 3, 8, 3, { floor: 3 }),
      { kind: 'stairs', x: 4, y: 0, width: 4, depth: 3, rise: 3, direction: '+x', floor: 0, height: 3 },
    ];
    const floors = facesOf(pieces, 'floor');
    expect(floors.some((face) => face[0][2] === 3)).toBe(true);
    // the upper room's floor is one whole 24 m², whatever lies below it
    expect(total(floors.filter((face) => face[0][2] === 3))).toBeCloseTo(24, 6);
  });

  it('opens stairs at their top into the room on the floor above, above the room below', () => {
    const pieces: BlockPiece[] = [
      room(4, 0, 4, 2),
      room(4, 0, 4, 2, { floor: 3 }),
      { kind: 'stairs', x: 0, y: 0, width: 4, depth: 2, rise: 3, direction: '+x', floor: 0, height: 3 },
    ];
    // on the edge x = 4 between the stairs and the rooms no wall: above 3 m the stairs open into the upper room,
    // below it the top step's end (3 m high) closes off the room underneath
    const onEdge = (face: number[][]) => face.every((corner) => Math.abs(corner[0] - 4) < 1e-9);
    expect(facesOf(pieces, 'wall').filter(onEdge)).toHaveLength(0);
    const ends = facesOf(pieces, 'stairs').filter(onEdge);
    expect(Math.max(...ends.flatMap((face) => face.map((corner) => corner[2])))).toBeCloseTo(3, 6);
  });

  it('puts one wall between two rooms side by side', () => {
    const walls = total(facesOf([room(0, 0, 4, 3), room(4, 0, 4, 3)], 'wall'));
    // outer perimeter 22 m plus the 3 m between them, 3 m high
    expect(walls).toBeCloseTo((22 + 3) * 3, 6);
  });

  it('opens a room where a corridor runs into it, but not along a corridor beside it', () => {
    const corridor: BlockPiece = { kind: 'corridor', from: [4, 1.5], to: [10, 1.5], width: 1, floor: 0, height: 3 };
    const walls = total(facesOf([room(0, 0, 4, 3), corridor], 'wall'));
    // room 14 m minus the 1 m opening, corridor sides 2 × 6.5 m (it reaches half its width past its ends) and its far
    // end 1 m, 3 m high
    expect(walls).toBeCloseTo((14 - 1 + 13 + 1) * 3, 6);
    const beside: BlockPiece = { kind: 'corridor', from: [0, 3.5], to: [4, 3.5], width: 1, floor: 0, height: 3 };
    // the corridor (5 m long) runs along the room's wall: the wall between them stays – 14 m of room, the corridor's
    // far side 5 m, its ends 2 × 1 m and its near side where it reaches past the room 2 × 0.5 m
    expect(total(facesOf([room(0, 0, 4, 3), beside], 'wall'))).toBeCloseTo((14 + 5 + 2 + 1) * 3, 6);
  });

  it('bends a corridor once, along x first unless told otherwise', () => {
    const corridor: BlockPiece = { kind: 'corridor', from: [0, 0], to: [4, 3], width: 1, floor: 0, height: 3 };
    const [first, second] = pieceRects(corridor);
    expect(first).toEqual([-0.5, -0.5, 4.5, 0.5]);
    expect(second).toEqual([3.5, -0.5, 4.5, 3.5]);
    const other = pieceRects({ ...corridor, bend: 'y' });
    expect(other[0]).toEqual([-0.5, -0.5, 0.5, 3.5]);
  });

  it('cuts a doorway into a wall', () => {
    const pieces = [room(0, 0, 4, 3), room(4, 0, 4, 3)];
    const full = total(facesOf(pieces, 'wall'));
    // a door 1 m wide and 2 m high in the wall between them (the wall runs along y)
    const cut = total(facesOf(pieces, 'wall', [{ x: 4, y: 1.5, z: 0, angle: Math.PI / 2, width: 1, height: 2 }] as never));
    expect(full - cut).toBeCloseTo(2, 6);
  });

  it('builds stairs with steps up to the floor above, and knows the floor height along them', () => {
    const stairs: BlockPiece = { kind: 'stairs', x: 0, y: 0, width: 4, depth: 1, floor: 0, rise: 1.8, direction: '+x', height: 3 };
    const steps = facesOf([stairs], 'stairs');
    // ten steps of 18 cm, five faces each
    expect(steps).toHaveLength(50);
    const highest = Math.max(...steps.flat().map(([, , z]) => z));
    expect(highest).toBeCloseTo(1.8, 6);
    expect(blockoutFloorAt([stairs], 2, 0.5)).toBeCloseTo(0.9, 6);
    expect(blockoutFloorAt([stairs], 9, 9)).toBeNull();
  });
});
