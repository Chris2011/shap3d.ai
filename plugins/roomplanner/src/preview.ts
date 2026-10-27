import type { CatalogItem, Params, Parts } from './catalog';
import { FINISHES, type MaterialId } from './materials';
import { beamSolid } from './parts';

/** the convex hull of points (monotone chain) – the outline of a slanted bar seen from the front */
const hull = (points: number[][]) => {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: number[][]) => {
    const result: number[][] = [];
    for (const point of list) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) {
        result.pop();
      }
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

/**
 * A small front view of a piece for the catalog – drawn from the same parts the model gets (boxes as
 * rectangles, cylinders and spheres as their outlines), front-most last. No rendering needed.
 */
export const previewSvg = (item: CatalogItem, params: Params) => {
  const size = item.size(params);
  const shapes: { y: number; svg: string }[] = [];
  const fill = (material: MaterialId) => FINISHES[material].color;
  const stroke = 'stroke="#3b4048" stroke-width="0.006"';
  // front view: x to the right, z up (SVG y down), seen from the front (-y): smaller y lies in front
  const parts: Parts = {
    box: (x, y, z, w, d, h, material) =>
      shapes.push({
        y,
        svg: `<rect x="${x}" y="${-(z + h)}" width="${w}" height="${h}" fill="${fill(material)}" fill-opacity="${FINISHES[material].opacity ?? 1}" ${stroke}/>`,
      }),
    cylinder: (x, y, z, radius, h, material) =>
      shapes.push({
        y: y - radius,
        svg: `<rect x="${x - radius}" y="${-(z + h)}" width="${2 * radius}" height="${h}" fill="${fill(material)}" ${stroke}/>`,
      }),
    prism: (points, z, h, material) => {
      const xs = points.map(([x]) => x),
        ys = points.map(([, y]) => y);
      shapes.push({
        y: Math.min(...ys),
        svg: `<rect x="${Math.min(...xs)}" y="${-(z + h)}" width="${Math.max(...xs) - Math.min(...xs)}" height="${h}" fill="${fill(material)}" ${stroke}/>`,
      });
    },
    beam: (a, b, width, height, material) => {
      const corners = beamSolid(a, b, width, height).vertices;
      shapes.push({
        y: Math.min(a[1], b[1]),
        svg: `<polygon points="${hull(corners.map(([x, , z]) => [x, -z]))
          .map((point) => point.join(','))
          .join(' ')}" fill="${fill(material)}" ${stroke}/>`,
      });
    },
    sphere: (x, y, z, radius, material) =>
      shapes.push({ y: y - radius, svg: `<circle cx="${x}" cy="${-z}" r="${radius}" fill="${fill(material)}" ${stroke}/>` }),
  };
  item.build(parts, params, size);
  shapes.sort((a, b) => b.y - a.y);
  const [w, , h] = size;
  const pad = Math.max(w, h) * 0.06;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2 - pad} ${-h - pad} ${w + 2 * pad} ${h + 2 * pad}" preserveAspectRatio="xMidYMid meet">${shapes.map((shape) => shape.svg).join('')}</svg>`;
};
