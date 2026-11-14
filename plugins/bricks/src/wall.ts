/**
 * A wall laid like a bricklayer does: long bricks, the joints of each row shifted against the row below, and gaps
 * left where a door or window goes. Pure, so it can be tested; lengths count in studs.
 */

export interface WallOpening {
  /** studs from the wall's start */
  at: number;
  width: number;
  /** the first row it takes (0 = the bottom) */
  from: number;
  rows: number;
}

export interface WallPiece {
  /** studs from the wall's start */
  start: number;
  /** 4, 2 or 1 studs long */
  size: 4 | 2 | 1;
  row: number;
}

export const wallPieces = (length: number, rows: number, openings: WallOpening[] = []): WallPiece[] => {
  const pieces: WallPiece[] = [];
  for (let row = 0; row < rows; row++) {
    const open = (stud: number) =>
      openings.some(
        (opening) => stud >= opening.at && stud < opening.at + opening.width && row >= opening.from && row < opening.from + opening.rows,
      );
    let stud = 0;
    while (stud < length) {
      if (open(stud)) {
        stud++;
        continue;
      }
      let end = stud;
      while (end < length && !open(end)) {
        end++;
      }
      // every other row starts with a short brick, so no joint sits on the joint below
      if (row % 2 === 1 && end - stud > 2) {
        pieces.push({ start: stud, size: 2, row });
        stud += 2;
      }
      for (const size of [4, 2, 1] as const) {
        while (end - stud >= size) {
          pieces.push({ start: stud, size, row });
          stud += size;
        }
      }
    }
  }
  return pieces;
};
