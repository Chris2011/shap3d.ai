import type { CameraState, FaceStyle } from '../../../src/core/document';
import { pluginContext } from './runtime';

/**
 * The layout document: sheets (pages) with their elements, kept on the model (`pluginData.layout`) so a single
 * .shap3d.json holds model and plans. All lengths on paper are millimetres from the top left corner.
 */

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'Letter' | 'Tabloid';
export type Orientation = 'landscape' | 'portrait';
/** raster: the rendered image · vector: lines only · hybrid: the image without edges plus vector lines on top */
export type RenderMode = 'raster' | 'vector' | 'hybrid';

/** dash patterns of lines */
export type Dash = 'solid' | 'dashed' | 'dotted' | 'dashDot';
/** fill patterns (hatches), e.g. for cut walls in plans */
export type Pattern = 'none' | 'solid' | 'hatch' | 'crossHatch' | 'dots' | 'brick' | 'concrete' | 'insulation';

/** how a line or shape is drawn – missing values: black, 0.35 mm, solid, no fill */
export interface ShapeStyle {
  stroke?: string;
  /** line width in mm (0 = no line) */
  width?: number;
  dash?: Dash;
  fill?: string;
  pattern?: Pattern;
}

/** what every element has */
interface Base {
  id: string;
  /** locked elements cannot be selected on the sheet (only in the list) */
  locked?: boolean;
  style?: ShapeStyle;
  /** the layer it is on; missing = the first layer */
  layer?: string;
}

/** how the cut surfaces of a section are filled in a viewport (the poché of a plan) */
export interface SectionFill {
  color: string;
  pattern: Pattern;
}

export interface ViewportElement extends Base {
  type: 'viewport';
  x: number;
  y: number;
  w: number;
  h: number;
  /** the scene it shows (live – a changed scene changes the viewport); null = the camera below */
  sceneId: number | null;
  /** the view when it was placed – used when the scene is gone */
  camera: CameraState;
  /** drawing scale 1:scale (parallel projection); null = fit the view into the frame */
  scale: number | null;
  render: RenderMode;
  /** the section plane it cuts with: undefined = as in the model now, null = none, a number = only this plane */
  sectionId?: number | null;
  /** fill of the cut surfaces; missing = not filled */
  sectionFill?: SectionFill;
  /** face style instead of the scene's; missing = the scene's */
  faceStyle?: FaceStyle;
  /** tags hidden in this viewport instead of the scene's; missing = the scene's */
  hiddenTags?: string[];
  /** a title under the frame, followed by the live scale; missing = no title */
  caption?: string;
  /** false: resizing the frame changes the scale instead of the part of the model shown */
  preserveScale?: boolean;
}
export interface TextElement extends Base {
  type: 'text';
  x: number;
  y: number;
  text: string;
  /** letter height in mm */
  size: number;
  /** degrees, clockwise */
  rotation?: number;
  bold?: boolean;
}
/** text with a leader line and an arrow pointing at something */
export interface LabelElement extends Base {
  type: 'label';
  /** the arrow tip */
  x1: number;
  y1: number;
  /** where the text starts */
  x2: number;
  y2: number;
  text: string;
  size: number;
}
export interface LineElement extends Base {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
/** a polyline – freehand drawing, joined lines */
export interface PathElement extends Base {
  type: 'path';
  points: [number, number][];
  closed: boolean;
}
/** square, rounded (radius), lozenge (fully round ends) or bulged (the two long sides curved outwards) */
export type Corners = 'square' | 'rounded' | 'lozenge' | 'bulged';
export interface RectElement extends Base {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  corners?: Corners;
  /** corner radius (rounded) or bulge (bulged) in mm */
  radius?: number;
}
export interface CircleElement extends Base {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
}
export interface EllipseElement extends Base {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface PolygonElement extends Base {
  type: 'polygon';
  cx: number;
  cy: number;
  r: number;
  sides: number;
  /** degrees */
  rotation: number;
}
/** an arc from angle `start` to `end` (degrees, clockwise on paper, 0 = right); pie: closed to the centre */
export interface ArcElement extends Base {
  type: 'arc';
  cx: number;
  cy: number;
  r: number;
  start: number;
  end: number;
  pie?: boolean;
}
export interface DimensionElement extends Base {
  type: 'dimension';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** distance of the dimension line from the measured points (mm, to the left of the direction 1 → 2) */
  offset: number;
}
/** an angle: vertex, a point on each leg and the radius of the dimension arc */
export interface AngleElement extends Base {
  type: 'angle';
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
}
/** a picture (PNG, JPEG, SVG) as data URL */
export interface ImageElement extends Base {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
}
/** a 2D symbol from the library (door, bed, WC …) in real size at a drawing scale */
export interface SymbolElement extends Base {
  type: 'symbol';
  symbol: string;
  /** top left corner of the symbol before rotation */
  x: number;
  y: number;
  /** drawing scale 1:scale – a 0.9 m door is 18 mm at 1:50 */
  scale: number;
  /** degrees, clockwise, around the symbol's centre */
  rotation: number;
  mirror: boolean;
}
/** elements kept together – they move, copy and delete as one */
export interface GroupElement extends Base {
  type: 'group';
  elements: LayoutElement[];
}
export type LayoutElement =
  | ViewportElement
  | TextElement
  | LabelElement
  | LineElement
  | PathElement
  | RectElement
  | CircleElement
  | EllipseElement
  | PolygonElement
  | ArcElement
  | DimensionElement
  | AngleElement
  | ImageElement
  | SymbolElement
  | GroupElement;

export interface LayoutPage {
  id: string;
  name: string;
  size: PaperSize;
  orientation: Orientation;
  /** frame and title block in the bottom right corner */
  titleBlock: boolean;
  elements: LayoutElement[];
}
/** layers sort the elements of every page: hidden ones are not shown or printed, locked ones cannot be picked */
export interface LayoutLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}
/** units of the dimensions on scaled viewports; 'model' = the model's units and precision */
export type DimensionUnits = 'model' | 'mm' | 'cm' | 'm' | 'in' | 'ft';
/** File › Document setup */
export interface DocumentSetup {
  grid: boolean;
  /** grid spacing in mm */
  gridSpacing: number;
  /** points snap to the grid (otherwise to 0.5 mm) */
  snapToGrid: boolean;
  dimensionUnits: DimensionUnits;
  /** decimals of dimensions (not with 'model') */
  dimensionPrecision: number;
}
export interface LayoutDocument {
  version: 1;
  pages: LayoutPage[];
  /** bottom to top; missing = one layer "Default" */
  layers?: LayoutLayer[];
  setup?: Partial<DocumentSetup>;
}

export const DEFAULT_LAYER_ID = 'default';
/** the layers of a document – at least one */
export const layersOf = (document: LayoutDocument): LayoutLayer[] =>
  document.layers?.length ? document.layers : [{ id: DEFAULT_LAYER_ID, name: '', visible: true, locked: false }];
/** the layer of an element (elements of a layer that is gone go to the first one) */
export const layerOf = (document: LayoutDocument, element: { layer?: string }) => {
  const layers = layersOf(document);
  return layers.find((layer) => layer.id === element.layer) ?? layers[0];
};

export const DEFAULT_SETUP: DocumentSetup = {
  grid: false,
  gridSpacing: 5,
  snapToGrid: false,
  dimensionUnits: 'model',
  dimensionPrecision: 2,
};
export const setupOf = (document: LayoutDocument): DocumentSetup => ({ ...DEFAULT_SETUP, ...document.setup });

/** paper sizes in mm, landscape */
export const PAPER: Record<PaperSize, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  Letter: [279.4, 215.9],
  Tabloid: [431.8, 279.4],
};
export const PAPER_SIZES = Object.keys(PAPER) as PaperSize[];

/** the scales offered for viewports (1:n) */
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export const MARGIN = 10;
export const TITLE_BLOCK = { w: 170, h: 32 };

export const pageSize = (page: LayoutPage): [number, number] => {
  const [long, short] = PAPER[page.size];
  return page.orientation === 'landscape' ? [long, short] : [short, long];
};

export const newId = () => Math.random().toString(36).slice(2, 10);

const emptyDocument = (): LayoutDocument => ({ version: 1, pages: [] });

/** the document on the model (a copy – change it and hand it to `saveDocument`) */
export const loadDocument = (): LayoutDocument => {
  const stored = pluginContext().data.getModel<LayoutDocument>();
  return stored?.pages ? (JSON.parse(JSON.stringify(stored)) as LayoutDocument) : emptyDocument();
};

/** stores the document on the model as one undo step */
export const saveDocument = (document: LayoutDocument, label = 'layout.undo.edit') => {
  const context = pluginContext();
  context.editor.commit(label, () => context.data.setModel(document));
};

/** changes the document as one undo step: `change` gets a copy and edits it */
export const changeDocument = (change: (document: LayoutDocument) => void, label?: string) => {
  const document = loadDocument();
  change(document);
  saveDocument(document, label);
};

export const newPage = (name: string, size: PaperSize = 'A3', orientation: Orientation = 'landscape'): LayoutPage => ({
  id: newId(),
  name,
  size,
  orientation,
  titleBlock: true,
  elements: [],
});

/** the drawing area of a page: inside the frame, above the title block */
export const drawingArea = (page: LayoutPage) => {
  const [width, height] = pageSize(page);
  const bottom = page.titleBlock ? TITLE_BLOCK.h + 4 : 0;
  return { x: MARGIN + 5, y: MARGIN + 5, w: width - 2 * MARGIN - 10, h: height - 2 * MARGIN - 10 - bottom };
};
