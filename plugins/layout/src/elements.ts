import { newId, type LayoutElement } from './document';
import type { Point } from './geometry';
import { polygonPoints, symbolSize } from './render';

/** What the editor needs to know about each kind of element: moving, bounds, handles and copies. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** the element moved by dx, dy (a copy) */
export const moved = (element: LayoutElement, dx: number, dy: number): LayoutElement => {
  switch (element.type) {
    case 'line':
    case 'dimension':
    case 'label':
      return { ...element, x1: element.x1 + dx, y1: element.y1 + dy, x2: element.x2 + dx, y2: element.y2 + dy };
    case 'angle':
      return {
        ...element,
        cx: element.cx + dx,
        cy: element.cy + dy,
        x1: element.x1 + dx,
        y1: element.y1 + dy,
        x2: element.x2 + dx,
        y2: element.y2 + dy,
      };
    case 'circle':
    case 'ellipse':
    case 'polygon':
    case 'arc':
      return { ...element, cx: element.cx + dx, cy: element.cy + dy };
    case 'path':
      return { ...element, points: element.points.map(([x, y]) => [x + dx, y + dy]) };
    case 'group':
      return { ...element, elements: element.elements.map((child) => moved(child, dx, dy)) };
    default:
      return { ...element, x: element.x + dx, y: element.y + dy };
  }
};

/** a copy with new ids (also inside groups) */
export const copied = (element: LayoutElement): LayoutElement => {
  const copy = JSON.parse(JSON.stringify(element)) as LayoutElement;
  const renew = (item: LayoutElement) => {
    item.id = newId();
    if (item.type === 'group') {
      item.elements.forEach(renew);
    }
  };
  renew(copy);
  return copy;
};

const boxOfPoints = (points: Point[]): Box => {
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

export const unionBox = (boxes: Box[]): Box =>
  boxOfPoints(
    boxes.flatMap((box) => [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
    ]),
  );

const textWidth = (text: string, size: number) => Math.max(...text.split('\n').map((line) => line.length)) * size * 0.55;

/** a box around the element (for the selection frame and the rubber band) */
export const elementBounds = (element: LayoutElement): Box => {
  switch (element.type) {
    case 'viewport':
      // with its title underneath
      return { x: element.x, y: element.y, w: element.w, h: element.h + (element.caption !== undefined ? 7 : 0) };
    case 'rect':
    case 'image':
      return { x: element.x, y: element.y, w: element.w, h: element.h };
    case 'line':
    case 'dimension':
      return boxOfPoints([
        { x: element.x1, y: element.y1 },
        { x: element.x2, y: element.y2 },
      ]);
    case 'angle':
      return boxOfPoints([
        { x: element.cx - element.r, y: element.cy - element.r },
        { x: element.cx + element.r, y: element.cy + element.r },
        { x: element.x1, y: element.y1 },
        { x: element.x2, y: element.y2 },
      ]);
    case 'label': {
      const width = textWidth(element.text, element.size) + 4;
      const textX = element.x2 < element.x1 ? element.x2 - width : element.x2;
      return boxOfPoints([
        { x: element.x1, y: element.y1 },
        { x: textX, y: element.y2 - element.size },
        { x: textX + width, y: element.y2 + element.size * element.text.split('\n').length },
      ]);
    }
    case 'circle':
    case 'arc':
      return { x: element.cx - element.r, y: element.cy - element.r, w: 2 * element.r, h: 2 * element.r };
    case 'ellipse':
      return { x: element.cx - element.rx, y: element.cy - element.ry, w: 2 * element.rx, h: 2 * element.ry };
    case 'polygon':
      return boxOfPoints(polygonPoints(element).map(([x, y]) => ({ x, y })));
    case 'path':
      return boxOfPoints(element.points.map(([x, y]) => ({ x, y })));
    case 'text': {
      const lines = element.text.split('\n');
      return { x: element.x, y: element.y - element.size, w: textWidth(element.text, element.size), h: lines.length * element.size * 1.25 };
    }
    case 'symbol': {
      const { w, h } = symbolSize(element);
      const centre = { x: element.x + w / 2, y: element.y + h / 2 };
      const angle = ((element.rotation || 0) * Math.PI) / 180;
      const corners = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].map(([x, y]) => ({
        x: centre.x + x * Math.cos(angle) - y * Math.sin(angle),
        y: centre.y + x * Math.sin(angle) + y * Math.cos(angle),
      }));
      return boxOfPoints(corners);
    }
    case 'group':
      return unionBox(element.elements.map(elementBounds));
  }
};

/** the sides and corners of a frame, by compass direction */
export type FrameHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const FRAME_HANDLES: FrameHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface Handle {
  id: 'start' | 'end' | 'corner' | 'radius' | 'vertex' | FrameHandle;
  x: number;
  y: number;
}

/** where a frame handle sits on a box */
const frameHandle = (box: Box, id: FrameHandle): Handle => ({
  id,
  x: box.x + (id.includes('w') ? 0 : id.includes('e') ? box.w : box.w / 2),
  y: box.y + (id.includes('n') ? 0 : id.includes('s') ? box.h : box.h / 2),
});

/** the box with one side or corner pulled to `point` (at least `least` mm wide and high) */
const pulledBox = (box: Box, id: FrameHandle, point: Point, least = 2): Box => {
  const right = box.x + box.w,
    bottom = box.y + box.h;
  const x = id.includes('w') ? Math.min(point.x, right - least) : box.x;
  const y = id.includes('n') ? Math.min(point.y, bottom - least) : box.y;
  const newRight = id.includes('e') ? Math.max(point.x, x + least) : right;
  const newBottom = id.includes('s') ? Math.max(point.y, y + least) : bottom;
  return { x, y, w: newRight - x, h: newBottom - y };
};

/** the points that can be pulled to change the element */
export const handlesOf = (element: LayoutElement): Handle[] => {
  switch (element.type) {
    case 'line':
    case 'dimension':
    case 'label':
    case 'angle':
      return [
        { id: 'start', x: element.x1, y: element.y1 },
        { id: 'end', x: element.x2, y: element.y2 },
        ...(element.type === 'angle' ? [{ id: 'vertex' as const, x: element.cx, y: element.cy }] : []),
      ];
    case 'viewport':
    case 'rect':
    case 'image':
      return FRAME_HANDLES.map((id) => frameHandle(element, id));
    case 'ellipse':
      return [{ id: 'corner', x: element.cx + element.rx, y: element.cy + element.ry }];
    case 'circle':
    case 'polygon':
    case 'arc':
      return [{ id: 'radius', x: element.cx + element.r, y: element.cy }];
    default:
      return [];
  }
};

/** the element with a handle pulled to `point` (a copy) */
export const withHandle = (element: LayoutElement, handle: Handle['id'], point: Point): LayoutElement => {
  switch (element.type) {
    case 'line':
    case 'dimension':
    case 'label':
    case 'angle':
      if (handle === 'vertex' && element.type === 'angle') {
        return { ...element, cx: point.x, cy: point.y };
      }
      return handle === 'start' ? { ...element, x1: point.x, y1: point.y } : { ...element, x2: point.x, y2: point.y };
    case 'circle':
    case 'polygon':
    case 'arc':
      return { ...element, r: Math.max(0.5, Math.hypot(point.x - element.cx, point.y - element.cy)) };
    case 'ellipse':
      return { ...element, rx: Math.max(0.5, Math.abs(point.x - element.cx)), ry: Math.max(0.5, Math.abs(point.y - element.cy)) };
    case 'viewport': {
      const box = pulledBox(element, handle as FrameHandle, point, 10);
      // without "preserve scale" the frame keeps showing the same part of the model: the scale follows its height
      const scale =
        element.scale && element.preserveScale === false ? Math.round(((element.scale * element.h) / box.h) * 10) / 10 : element.scale;
      return { ...element, ...box, scale };
    }
    case 'rect':
    case 'image':
      return { ...element, ...pulledBox(element, handle as FrameHandle, point) };
    default:
      return element;
  }
};
