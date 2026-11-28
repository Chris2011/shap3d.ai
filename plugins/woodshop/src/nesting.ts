// Nesting: the boards of one material and thickness laid out on sheets – in strips across the sheet, so every cut goes
// straight through (as on a panel saw). Plain numbers only, tested in test/nesting.test.ts.

export interface SheetSettings {
  /** sheet size in metres: length along the sheet's grain, width across it */
  length: number;
  width: number;
  /** saw cut between pieces */
  kerf: number;
  /** trimmed off each edge of the sheet first */
  trim: number;
  /** keep each board's grain along the sheet's grain (no turning) */
  grain: boolean;
}

export const DEFAULT_SHEET: SheetSettings = { length: 2.8, width: 2.07, kerf: 0.004, trim: 0.01, grain: true };

/** a board to cut: length is the side along its grain */
export interface Piece {
  name: string;
  length: number;
  width: number;
}

/** a piece on a sheet: x along the sheet's length, y across it; size as it lies (turned: length across) */
export interface Placed extends Piece {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  turned: boolean;
}

export interface Sheet {
  pieces: Placed[];
  /** share of the sheet's area that becomes boards (0–1) */
  usage: number;
}

interface Strip {
  y: number;
  height: number;
  used: number;
}

const EPSILON = 1e-9;

export const nest = (pieces: Piece[], settings: SheetSettings) => {
  const usableX = settings.length - 2 * settings.trim;
  const usableY = settings.width - 2 * settings.trim;
  const sheets: { pieces: Placed[]; strips: Strip[] }[] = [];
  const tooBig: Piece[] = [];
  // the ways a piece may lie, best first: along the grain, or (grain free) its longer side along the sheet
  const ways = (piece: Piece): [number, number, boolean][] => {
    const along: [number, number, boolean] = [piece.length, piece.width, false];
    const turned: [number, number, boolean] = [piece.width, piece.length, true];
    if (settings.grain) {
      return [along];
    }
    return piece.length >= piece.width ? [along, turned] : [turned, along];
  };
  // widest first, so each strip is as high as its first piece and the rest fill it
  const height = (piece: Piece) => ways(piece)[0][1];
  const order = [...pieces].sort((a, b) => height(b) - height(a) || b.length - a.length);
  for (const piece of order) {
    const fitting = ways(piece).filter(([sizeX, sizeY]) => sizeX <= usableX + EPSILON && sizeY <= usableY + EPSILON);
    if (!fitting.length) {
      tooBig.push(piece);
      continue;
    }
    const put = (sheet: (typeof sheets)[number], strip: Strip, [sizeX, sizeY, turned]: [number, number, boolean]) => {
      sheet.pieces.push({ ...piece, x: settings.trim + strip.used, y: settings.trim + strip.y, sizeX, sizeY, turned });
      strip.used += sizeX + settings.kerf;
    };
    const placed = sheets.some((sheet) =>
      fitting.some((way) => {
        // into a strip that is high enough and has room left …
        const strip = sheet.strips.find(
          (candidate) => way[1] <= candidate.height + EPSILON && candidate.used + way[0] <= usableX + EPSILON,
        );
        if (strip) {
          put(sheet, strip, way);
          return true;
        }
        // … or a new strip below the last one
        const last = sheet.strips[sheet.strips.length - 1];
        const y = last ? last.y + last.height + settings.kerf : 0;
        if (y + way[1] <= usableY + EPSILON) {
          const fresh = { y, height: way[1], used: 0 };
          sheet.strips.push(fresh);
          put(sheet, fresh, way);
          return true;
        }
        return false;
      }),
    );
    if (!placed) {
      const sheet = { pieces: [], strips: [{ y: 0, height: fitting[0][1], used: 0 }] };
      sheets.push(sheet);
      put(sheet, sheet.strips[0], fitting[0]);
    }
  }
  const area = settings.length * settings.width;
  return {
    sheets: sheets.map((sheet): Sheet => ({
      pieces: sheet.pieces,
      usage: sheet.pieces.reduce((sum, piece) => sum + piece.length * piece.width, 0) / area,
    })),
    tooBig,
  };
};
