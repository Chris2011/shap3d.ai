import type { ViewLines, ViewRequest } from '../../../src/plugins/types';
import {
  MARGIN,
  TITLE_BLOCK,
  layerOf,
  layersOf,
  pageSize,
  setupOf,
  type DimensionElement,
  type LayoutDocument,
  type LayoutElement,
  type AngleElement,
  type Dash,
  type LabelElement,
  type LayoutPage,
  type Pattern,
  type PolygonElement,
  type RectElement,
  type ShapeStyle,
  type SymbolElement,
  type ViewportElement,
} from './document';
import { pluginContext, t, formatNumber, locale } from './runtime';
import { angleTo, arcPath } from './geometry';
import { symbolById, symbolMarkup } from './symbols';
import { sectionCutPath, withSection } from './section';

/**
 * Pages as SVG (millimetres): the editor shows this markup, the SVG export saves it and printing puts one per
 * sheet – so screen and paper look the same. Viewports are rendered by the app (context.render) and cached
 * until the model, the scene or the frame changes.
 */

/** pixels per millimetre of a viewport image – fine enough for print, capped for big sheets */
const PIXELS_PER_MM = 5;
const MAX_PIXELS = 2400;
const EDGE_WIDTH = 0.18;
const PROFILE_WIDTH = 0.45;
const LINE_WIDTH = 0.35;

const escapeXml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
const mm = (value: number) => Number(value.toFixed(3));

// ------------------------------------------------------------ viewports
interface ViewportView {
  image?: string;
  lines?: ViewLines;
  /** request pixels per paper millimetre */
  scale: number;
  /** the cut surfaces of the section, an SVG path in request pixels */
  cut?: string;
}
const cache = new Map<string, ViewportView>();

/** what the app renders for a viewport: its scene (or stored camera), size and drawing scale, its own overrides */
export const viewportRequest = (viewport: ViewportElement): ViewRequest => {
  const model = pluginContext().editor.model;
  const scene = viewport.sceneId != null ? model.scenes.find((candidate) => candidate.id === viewport.sceneId) : undefined;
  const pixels = Math.min(PIXELS_PER_MM, MAX_PIXELS / Math.max(viewport.w, viewport.h));
  return {
    camera: scene?.camera ?? viewport.camera,
    width: Math.max(8, Math.round(viewport.w * pixels)),
    height: Math.max(8, Math.round(viewport.h * pixels)),
    // plans on white paper: no sky and no ground
    style: { ...scene?.style, ...(viewport.faceStyle ? { faceStyle: viewport.faceStyle } : {}), sky: false, ground: false },
    hiddenTags: viewport.hiddenTags ?? scene?.hiddenTags,
    orthoHeight: viewport.scale ? (viewport.h * viewport.scale) / 1000 : undefined,
  };
};

/** rendered once per model state (`signature`), scene, frame, section and mode */
const viewportView = (viewport: ViewportElement, signature: string): ViewportView => {
  const request = viewportRequest(viewport);
  const key = JSON.stringify([signature, viewport.render, viewport.sectionId, !!viewport.sectionFill, request]);
  let view = cache.get(key);
  if (!view) {
    const render = pluginContext().render;
    const result: ViewportView = { scale: request.width / viewport.w };
    withSection(viewport, () => {
      if (viewport.render !== 'vector') {
        // hybrid: the image without its edges, the lines come as vectors on top
        const style = viewport.render === 'hybrid' ? { ...request.style, edges: false, profiles: false } : request.style;
        result.image = render.image({ ...request, style });
      }
      if (viewport.render !== 'raster') {
        result.lines = render.lines(request);
      }
      if (viewport.sectionFill) {
        result.cut = sectionCutPath(request);
      }
    });
    view = result;
    if (cache.size > 60) {
      cache.clear();
    }
    cache.set(key, view);
  }
  return view;
};

/** the scale as written on plans, e.g. 1:50 or 1:62.5 */
export const scaleText = (scale: number) => `1:${formatNumber(scale, { maximumFractionDigits: 1 })}`;

/** the title under a viewport: its caption and the live scale */
const captionSvg = (viewport: ViewportElement) => {
  if (viewport.caption === undefined) {
    return '';
  }
  const y = viewport.y + viewport.h + 5;
  const scale = viewport.scale ? scaleText(viewport.scale) : '';
  return `<text x="${mm(viewport.x)}" y="${mm(y)}" font-size="3.5"><tspan font-weight="700">${escapeXml(viewport.caption)}</tspan>${
    scale ? `<tspan dx="3" font-size="3">${escapeXml(scale)}</tspan>` : ''
  }</text>`;
};

const viewportSvg = (viewport: ViewportElement, signature: string, interactive: boolean) => {
  const view = viewportView(viewport, signature);
  const clip = `clip-${viewport.id}`;
  const toMm = (value: number) => mm(value / view.scale);
  const lines = (list: ViewLines['edges'], width: number) =>
    list.length
      ? `<path d="${list.map(([x1, y1, x2, y2]) => `M${toMm(x1)} ${toMm(y1)}L${toMm(x2)} ${toMm(y2)}`).join('')}" stroke="#000" stroke-width="${width}" stroke-linecap="round" fill="none"/>`
      : '';
  // the cut surfaces lie in front of everything else: over the image and the lines, with a strong outline
  const fill = viewport.sectionFill;
  const cut = view.cut && fill ? view.cut.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, (value) => String(toMm(Number(value)))) : '';
  const cutSvg = cut
    ? [
        `<path d="${cut}" fill="${escapeXml(fill!.color)}" fill-rule="evenodd" stroke="none"/>`,
        fill!.pattern !== 'none' && fill!.pattern !== 'solid'
          ? `<path d="${cut}" fill="url(#s3d-lo-${fill!.pattern})" fill-rule="evenodd" stroke="none"/>`
          : '',
        `<path d="${cut}" fill="none" stroke="#000" stroke-width="${PROFILE_WIDTH}" stroke-linejoin="round"/>`,
      ].join('')
    : '';
  return [
    `<clipPath id="${clip}"><rect x="${mm(viewport.x)}" y="${mm(viewport.y)}" width="${mm(viewport.w)}" height="${mm(viewport.h)}"/></clipPath>`,
    `<g clip-path="url(#${clip})">`,
    // a white backdrop makes the whole frame clickable
    `<rect x="${mm(viewport.x)}" y="${mm(viewport.y)}" width="${mm(viewport.w)}" height="${mm(viewport.h)}" fill="#fff"/>`,
    view.image
      ? `<image href="${view.image}" x="${mm(viewport.x)}" y="${mm(viewport.y)}" width="${mm(viewport.w)}" height="${mm(viewport.h)}" preserveAspectRatio="none"/>`
      : '',
    view.lines
      ? `<g transform="translate(${mm(viewport.x)} ${mm(viewport.y)})">${lines(view.lines.edges, EDGE_WIDTH)}${lines(view.lines.profiles, PROFILE_WIDTH)}</g>`
      : '',
    cutSvg ? `<g transform="translate(${mm(viewport.x)} ${mm(viewport.y)})">${cutSvg}</g>` : '',
    '</g>',
    captionSvg(viewport),
    interactive
      ? `<rect x="${mm(viewport.x)}" y="${mm(viewport.y)}" width="${mm(viewport.w)}" height="${mm(viewport.h)}" fill="none" stroke="#9aa5b1" stroke-width="0.25" stroke-dasharray="1.5 1"/>`
      : '',
  ].join('');
};

// ------------------------------------------------------------ dimensions
/** the viewport with a drawing scale that contains both points – a dimension there measures the model */
export const viewportUnder = (page: LayoutPage, x: number, y: number) =>
  page.elements.find(
    (element): element is ViewportElement =>
      element.type === 'viewport' &&
      !!element.scale &&
      x >= element.x &&
      x <= element.x + element.w &&
      y >= element.y &&
      y <= element.y + element.h,
  );

/** metres per unit of the document's dimension units */
const UNIT_METRES = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 } as const;
const UNIT_SYMBOLS = { mm: 'mm', cm: 'cm', m: 'm', in: '″', ft: '′' } as const; // i18n-ignore – unit symbols

export const dimensionLabel = (document: LayoutDocument, page: LayoutPage, dimension: DimensionElement) => {
  const paper = Math.hypot(dimension.x2 - dimension.x1, dimension.y2 - dimension.y1);
  const first = viewportUnder(page, dimension.x1, dimension.y1);
  const second = viewportUnder(page, dimension.x2, dimension.y2);
  if (first && first === second) {
    const metres = (paper * first.scale!) / 1000;
    const setup = setupOf(document);
    if (setup.dimensionUnits === 'model') {
      return pluginContext().editor.fmt(metres);
    }
    const value = formatNumber(metres / UNIT_METRES[setup.dimensionUnits], {
      minimumFractionDigits: setup.dimensionPrecision,
      maximumFractionDigits: setup.dimensionPrecision,
    });
    const symbol = UNIT_SYMBOLS[setup.dimensionUnits];
    return setup.dimensionUnits === 'in' || setup.dimensionUnits === 'ft' ? `${value}${symbol}` : `${value} ${symbol}`;
  }
  return `${formatNumber(paper, { maximumFractionDigits: 1 })} mm`; // i18n-ignore – unit symbol
};

const dimensionSvg = (document: LayoutDocument, page: LayoutPage, dimension: DimensionElement) => {
  const { x1, y1, x2, y2, offset } = dimension;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const along = [(x2 - x1) / length, (y2 - y1) / length];
  const normal = [along[1], -along[0]];
  const a = [x1 + normal[0] * offset, y1 + normal[1] * offset];
  const b = [x2 + normal[0] * offset, y2 + normal[1] * offset];
  const reach = Math.sign(offset || 1) * 1.5;
  const tick = (point: number[]) =>
    `M${mm(point[0] - (along[0] + normal[0]) * 1.2)} ${mm(point[1] - (along[1] + normal[1]) * 1.2)}L${mm(point[0] + (along[0] + normal[0]) * 1.2)} ${mm(point[1] + (along[1] + normal[1]) * 1.2)}`;
  const path = [
    `M${mm(x1 + normal[0] * Math.sign(offset || 1))} ${mm(y1 + normal[1] * Math.sign(offset || 1))}L${mm(a[0] + normal[0] * reach)} ${mm(a[1] + normal[1] * reach)}`,
    `M${mm(x2 + normal[0] * Math.sign(offset || 1))} ${mm(y2 + normal[1] * Math.sign(offset || 1))}L${mm(b[0] + normal[0] * reach)} ${mm(b[1] + normal[1] * reach)}`,
    `M${mm(a[0])} ${mm(a[1])}L${mm(b[0])} ${mm(b[1])}`,
    tick(a),
    tick(b),
  ].join('');
  // the text sits above the line and reads from left to right
  let angle = (Math.atan2(along[1], along[0]) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) {
    angle += 180;
  }
  const middle = [
    (a[0] + b[0]) / 2 + normal[0] * 1.2 * Math.sign(offset || 1),
    (a[1] + b[1]) / 2 + normal[1] * 1.2 * Math.sign(offset || 1),
  ];
  return [
    `<path d="${path}" stroke="${escapeXml(dimension.style?.stroke ?? '#000')}" stroke-width="0.25" fill="none"/>`,
    `<text x="${mm(middle[0])}" y="${mm(middle[1])}" font-size="3" text-anchor="middle" dominant-baseline="${offset >= 0 ? 'auto' : 'hanging'}" transform="rotate(${mm(angle)} ${mm(middle[0])} ${mm(middle[1])})">${escapeXml(dimensionLabel(document, page, dimension))}</text>`,
  ].join('');
};

// ------------------------------------------------------------ styles and patterns
const DASHES: Record<Dash, (width: number) => string> = {
  solid: () => '',
  dashed: (width) => `${mm(width * 8)} ${mm(width * 5)}`,
  dotted: (width) => `${mm(width * 0.1)} ${mm(width * 3)}`,
  dashDot: (width) => `${mm(width * 10)} ${mm(width * 4)} ${mm(width * 0.1)} ${mm(width * 4)}`,
};

/** hatch patterns in paper millimetres – black lines on a transparent ground, the fill colour shows through */
const PATTERNS: Record<Exclude<Pattern, 'none' | 'solid'>, string> = {
  hatch:
    '<pattern id="s3d-lo-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#000" stroke-width="0.18"/></pattern>',
  crossHatch:
    '<pattern id="s3d-lo-crossHatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V2M0 0H2" stroke="#000" stroke-width="0.18"/></pattern>',
  dots: '<pattern id="s3d-lo-dots" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><circle cx="0.8" cy="0.8" r="0.18" fill="#000"/></pattern>',
  brick:
    '<pattern id="s3d-lo-brick" width="6" height="3" patternUnits="userSpaceOnUse"><path d="M0 0H6M0 1.5H6M0 0V1.5M3 1.5V3" stroke="#000" stroke-width="0.15" fill="none"/></pattern>',
  concrete:
    '<pattern id="s3d-lo-concrete" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1.2" r="0.25" fill="#000"/><circle cx="3.6" cy="2.4" r="0.18" fill="#000"/><path d="M2 3.6l0.6 0.9h-1.2z" fill="none" stroke="#000" stroke-width="0.12"/><circle cx="4.3" cy="4.4" r="0.12" fill="#000"/><path d="M3 0.6l0.5 0.6h-1z" fill="none" stroke="#000" stroke-width="0.12"/></pattern>',
  insulation:
    '<pattern id="s3d-lo-insulation" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 2Q1 0 2 2T4 2" stroke="#000" stroke-width="0.15" fill="none"/></pattern>',
};
export const PATTERN_NAMES: Pattern[] = ['none', 'solid', 'hatch', 'crossHatch', 'dots', 'brick', 'concrete', 'insulation'];
export const DASH_NAMES: Dash[] = ['solid', 'dashed', 'dotted', 'dashDot'];

const patternDefs = () => `<defs>${Object.values(PATTERNS).join('')}</defs>`;

/** stroke attributes of a style */
const strokeAttributes = (style: ShapeStyle | undefined) => {
  const width = style?.width ?? LINE_WIDTH;
  if (width <= 0) {
    return 'stroke="none"';
  }
  const dash = DASHES[style?.dash ?? 'solid'](width);
  return `stroke="${escapeXml(style?.stroke ?? '#000')}" stroke-width="${mm(width)}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}`;
};

/**
 * A shape (`tag` with its geometry `attributes`) in its style: with a hatch, the fill colour lies under the
 * pattern; closed shapes in the editor get a transparent fill so a click inside selects them.
 */
const styledShape = (tag: string, attributes: string, style: ShapeStyle | undefined, closed: boolean, interactive: boolean) => {
  const pattern = closed ? (style?.pattern ?? (style?.fill ? 'solid' : 'none')) : 'none';
  const color = style?.fill ?? '#ffffff';
  const parts: string[] = [];
  if (pattern !== 'none' && pattern !== 'solid') {
    if (style?.fill) {
      parts.push(`<${tag} ${attributes} fill="${escapeXml(color)}" stroke="none"/>`);
    }
    parts.push(`<${tag} ${attributes} fill="url(#s3d-lo-${pattern})" ${strokeAttributes(style)}/>`);
  } else {
    const fill = pattern === 'solid' ? escapeXml(color) : closed && interactive ? 'rgba(0,0,0,0)' : 'none';
    // thin open lines get a wide invisible stroke underneath, easy to click
    if (!closed && interactive) {
      parts.push(`<${tag} ${attributes} fill="none" stroke="transparent" stroke-width="3"/>`);
    }
    parts.push(`<${tag} ${attributes} fill="${fill}" ${strokeAttributes(style)}/>`);
  }
  return parts.join('');
};

// ------------------------------------------------------------ symbols
/** the size of a placed symbol on paper (mm), before rotation */
export const symbolSize = (element: SymbolElement) => {
  const symbol = symbolById(element.symbol);
  const factor = 1000 / element.scale;
  return { w: (symbol?.w ?? 1) * factor, h: (symbol?.h ?? 1) * factor };
};

/** the transform that places, mirrors and rotates a symbol around its centre */
export const symbolTransform = (element: SymbolElement) => {
  const { w, h } = symbolSize(element);
  const centre = [mm(element.x + w / 2), mm(element.y + h / 2)];
  const mirror = element.mirror ? ` translate(${mm(w)} 0) scale(-1 1)` : '';
  return `rotate(${element.rotation || 0} ${centre[0]} ${centre[1]}) translate(${mm(element.x)} ${mm(element.y)})${mirror}`;
};

const symbolSvg = (element: SymbolElement, interactive: boolean) => {
  const symbol = symbolById(element.symbol);
  if (!symbol) {
    return '';
  }
  const { w, h } = symbolSize(element);
  // thinner lines for small scales, never below what a printer still shows
  const stroke = Math.max(0.13, Math.min(0.35, 12 / element.scale));
  return `<g transform="${symbolTransform(element)}">${
    interactive ? `<rect width="${mm(w)}" height="${mm(h)}" fill="rgba(0,0,0,0)"/>` : ''
  }${symbolMarkup(symbol, 1000 / element.scale, stroke).replaceAll('#000', escapeXml(element.style?.stroke ?? '#000'))}</g>`;
};

// ------------------------------------------------------------ the other elements
const textSvg = (x: number, y: number, size: number, text: string, color = '#000', rotation = 0, bold = false, anchor = 'start') => {
  const lines = text.split('\n');
  const turn = rotation ? ` transform="rotate(${rotation} ${mm(x)} ${mm(y)})"` : '';
  const weight = bold ? ' font-weight="700"' : '';
  const align = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  return `<text x="${mm(x)}" y="${mm(y)}" font-size="${size}" fill="${escapeXml(color)}"${weight}${align}${turn}>${lines
    .map((line, i) => `<tspan x="${mm(x)}" dy="${i ? mm(size * 1.25) : 0}">${escapeXml(line || ' ')}</tspan>`)
    .join('')}</text>`;
};

/** the outline of a rectangle with its corners as SVG path or rect attributes */
const rectShape = (element: RectElement): [string, string] => {
  const { x, y, w, h } = element;
  const corners = element.corners ?? 'square';
  if (corners === 'bulged') {
    // the two longer sides bow outwards
    const bulge = element.radius ?? Math.min(w, h) * 0.15;
    const d =
      w >= h
        ? `M${mm(x)} ${mm(y)}Q${mm(x + w / 2)} ${mm(y - 2 * bulge)} ${mm(x + w)} ${mm(y)}L${mm(x + w)} ${mm(y + h)}Q${mm(x + w / 2)} ${mm(y + h + 2 * bulge)} ${mm(x)} ${mm(y + h)}Z`
        : `M${mm(x)} ${mm(y)}L${mm(x + w)} ${mm(y)}Q${mm(x + w + 2 * bulge)} ${mm(y + h / 2)} ${mm(x + w)} ${mm(y + h)}L${mm(x)} ${mm(y + h)}Q${mm(x - 2 * bulge)} ${mm(y + h / 2)} ${mm(x)} ${mm(y)}Z`;
    return ['path', `d="${d}"`];
  }
  const radius = corners === 'lozenge' ? Math.min(w, h) / 2 : corners === 'rounded' ? Math.min(element.radius ?? 3, Math.min(w, h) / 2) : 0;
  return ['rect', `x="${mm(x)}" y="${mm(y)}" width="${mm(w)}" height="${mm(h)}"${radius ? ` rx="${mm(radius)}"` : ''}`];
};

export const polygonPoints = (element: PolygonElement) =>
  Array.from({ length: element.sides }, (_, i) => {
    const angle = ((element.rotation - 90) * Math.PI) / 180 + (i * 2 * Math.PI) / element.sides;
    return [element.cx + element.r * Math.cos(angle), element.cy + element.r * Math.sin(angle)] as [number, number];
  });

const pointsAttribute = (points: [number, number][]) => `points="${points.map(([x, y]) => `${mm(x)},${mm(y)}`).join(' ')}"`;

const angleSvg = (element: AngleElement) => {
  const first = angleTo({ x: element.cx, y: element.cy }, { x: element.x1, y: element.y1 });
  const second = angleTo({ x: element.cx, y: element.cy }, { x: element.x2, y: element.y2 });
  // the smaller angle between the legs
  let start = first,
    end = second;
  if ((((end - start) % 360) + 360) % 360 > 180) {
    [start, end] = [end, start];
  }
  const sweep = (((end - start) % 360) + 360) % 360;
  const color = escapeXml(element.style?.stroke ?? '#000');
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const ray = (angle: number) => {
    const length = Math.max(element.r + 2, Math.hypot(element.x1 - element.cx, element.y1 - element.cy));
    return `M${mm(element.cx)} ${mm(element.cy)}L${mm(element.cx + length * Math.cos(radians(angle)))} ${mm(element.cy + length * Math.sin(radians(angle)))}`;
  };
  const middle = radians(start + sweep / 2);
  const label = `${formatNumber(sweep, { maximumFractionDigits: 1 })}°`;
  return `<path d="${ray(first)}${ray(second)}" stroke="${color}" stroke-width="0.18" fill="none"/><path d="${arcPath({ cx: element.cx, cy: element.cy, r: element.r, start, end })}" stroke="${color}" stroke-width="0.25" fill="none"/>${textSvg(
    element.cx + (element.r + 4) * Math.cos(middle),
    element.cy + (element.r + 4) * Math.sin(middle) + 1,
    3,
    label,
    element.style?.stroke,
    0,
    false,
    'middle',
  )}`;
};

const labelSvg = (element: LabelElement, interactive: boolean) => {
  // leader line with an arrow at the tip, the text right of (or left of) the leader's end
  const { x1, y1, x2, y2 } = element;
  const color = escapeXml(element.style?.stroke ?? '#000');
  const angle = Math.atan2(y1 - y2, x1 - x2);
  const arrow = (side: number) => [x1 - 2.2 * Math.cos(angle + side * 0.35), y1 - 2.2 * Math.sin(angle + side * 0.35)];
  const [leftX, leftY] = arrow(1),
    [rightX, rightY] = arrow(-1);
  const toLeft = x2 < x1;
  const shoulder = toLeft ? x2 - 3 : x2 + 3;
  const path = `M${mm(x1)} ${mm(y1)}L${mm(x2)} ${mm(y2)}H${mm(shoulder)}`;
  const click = interactive ? `<path d="${path}" stroke="transparent" stroke-width="3" fill="none"/>` : '';
  return `${click}<path d="${path}" stroke="${color}" stroke-width="0.25" fill="none"/><path d="M${mm(leftX)} ${mm(leftY)}L${mm(x1)} ${mm(y1)}L${mm(rightX)} ${mm(rightY)}Z" fill="${color}"/>${textSvg(
    toLeft ? shoulder - 1 : shoulder + 1,
    y2 + element.size * 0.35,
    element.size,
    element.text,
    element.style?.stroke,
    0,
    false,
    toLeft ? 'end' : 'start',
  )}`;
};

/** the markup of one element (without its data-id wrapper) */
const elementMarkup = (
  document: LayoutDocument,
  page: LayoutPage,
  element: LayoutElement,
  signature: string,
  interactive: boolean,
): string => {
  const style = element.style;
  switch (element.type) {
    case 'viewport':
      return viewportSvg(element, signature, interactive);
    case 'text':
      return textSvg(element.x, element.y, element.size, element.text, style?.stroke, element.rotation, element.bold);
    case 'label':
      return labelSvg(element, interactive);
    case 'line':
      return styledShape('path', `d="M${mm(element.x1)} ${mm(element.y1)}L${mm(element.x2)} ${mm(element.y2)}"`, style, false, interactive);
    case 'path':
      return styledShape(element.closed ? 'polygon' : 'polyline', pointsAttribute(element.points), style, element.closed, interactive);
    case 'rect': {
      const [tag, attributes] = rectShape(element);
      return styledShape(tag, attributes, style, true, interactive);
    }
    case 'circle':
      return styledShape('circle', `cx="${mm(element.cx)}" cy="${mm(element.cy)}" r="${mm(element.r)}"`, style, true, interactive);
    case 'ellipse':
      return styledShape(
        'ellipse',
        `cx="${mm(element.cx)}" cy="${mm(element.cy)}" rx="${mm(element.rx)}" ry="${mm(element.ry)}"`,
        style,
        true,
        interactive,
      );
    case 'polygon':
      return styledShape('polygon', pointsAttribute(polygonPoints(element)), style, true, interactive);
    case 'arc': {
      const path = arcPath(element);
      return element.pie
        ? styledShape('path', `d="${path}L${mm(element.cx)} ${mm(element.cy)}Z"`, style, true, interactive)
        : styledShape('path', `d="${path}"`, style, false, interactive);
    }
    case 'dimension':
      return dimensionSvg(document, page, element);
    case 'angle':
      return angleSvg(element);
    case 'image':
      return `<image href="${escapeXml(element.src)}" x="${mm(element.x)}" y="${mm(element.y)}" width="${mm(element.w)}" height="${mm(element.h)}" preserveAspectRatio="none"/>`;
    case 'symbol':
      return symbolSvg(element, interactive);
    case 'group':
      return element.elements.map((child) => elementMarkup(document, page, child, signature, interactive)).join('');
  }
};

const elementSvg = (document: LayoutDocument, page: LayoutPage, element: LayoutElement, signature: string, interactive: boolean) => {
  const locked = element.locked || layerOf(document, element).locked;
  return `<g data-id="${element.id}"${locked ? ' data-locked="1"' : ''}>${elementMarkup(document, page, element, signature, interactive)}</g>`;
};

/** the elements in drawing order: layer by layer (bottom first), hidden layers left out */
export const visibleElements = (document: LayoutDocument, page: LayoutPage) =>
  layersOf(document).flatMap((layer) =>
    layer.visible ? page.elements.filter((element) => layerOf(document, element).id === layer.id) : [],
  );

/** the drawing scales of a page's viewports, e.g. "1:50, 1:100" */
export const pageScales = (page: LayoutPage) => {
  const scales = [
    ...new Set(page.elements.flatMap((element) => (element.type === 'viewport' && element.scale ? [element.scale] : []))),
  ].sort((a, b) => a - b);
  return scales.length ? scales.map((scale) => `1:${scale}`).join(', ') : '–';
};

const titleBlockSvg = (page: LayoutPage, pageNumber: number, pageCount: number) => {
  const [width, height] = pageSize(page);
  const right = width - MARGIN;
  const bottom = height - MARGIN;
  const x = right - TITLE_BLOCK.w;
  const y = bottom - TITLE_BLOCK.h;
  const split = x + 100;
  const row = TITLE_BLOCK.h / 3;
  const label = (lx: number, ly: number, text: string) =>
    `<text x="${mm(lx)}" y="${mm(ly)}" font-size="2" fill="#6b7680">${escapeXml(text)}</text>`;
  const value = (vx: number, vy: number, text: string, size = 3.4) =>
    `<text x="${mm(vx)}" y="${mm(vy)}" font-size="${size}">${escapeXml(text)}</text>`;
  const date = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date());
  return [
    '<g data-title-block="1">',
    `<rect x="${MARGIN}" y="${MARGIN}" width="${mm(width - 2 * MARGIN)}" height="${mm(height - 2 * MARGIN)}" fill="none" stroke="#000" stroke-width="0.5"/>`,
    `<rect x="${mm(x)}" y="${mm(y)}" width="${TITLE_BLOCK.w}" height="${TITLE_BLOCK.h}" fill="#fff" stroke="#000" stroke-width="0.35"/>`,
    `<path d="M${mm(split)} ${mm(y)}V${mm(bottom)}M${mm(split)} ${mm(y + row)}H${mm(right)}M${mm(split)} ${mm(y + 2 * row)}H${mm(right)}M${mm(x)} ${mm(y + TITLE_BLOCK.h / 2)}H${mm(split)}" stroke="#000" stroke-width="0.2" fill="none"/>`,
    label(x + 2, y + 3.5, t('layout.titleBlock.project')),
    value(x + 2, y + 11, pluginContext().editor.model.name, 5),
    label(x + 2, y + TITLE_BLOCK.h / 2 + 3.5, t('layout.titleBlock.sheet')),
    value(x + 2, y + TITLE_BLOCK.h / 2 + 10, page.name, 4.2),
    label(split + 2, y + 3, t('layout.titleBlock.scale')),
    value(split + 2, y + row - 2, pageScales(page)),
    label(split + 2, y + row + 3, t('layout.titleBlock.date')),
    value(split + 2, y + 2 * row - 2, date),
    label(split + 2, y + 2 * row + 3, t('layout.titleBlock.page')),
    value(split + 2, bottom - 2, `${pageNumber} / ${pageCount}`),
    '</g>',
  ].join('');
};

/**
 * A page as an SVG document in millimetres. `interactive` adds what the editor needs (frames of viewports,
 * click areas); `signature` changes whenever the model changes, so viewports are rendered again then.
 */
export const pageSvg = (document: LayoutDocument, page: LayoutPage, signature: string, interactive = false) => {
  const [width, height] = pageSize(page);
  const pageNumber = document.pages.findIndex((candidate) => candidate.id === page.id) + 1;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="${width}" height="${height}" fill="#fff"/>`,
    patternDefs(),
    ...visibleElements(document, page).map((element) => elementSvg(document, page, element, signature, interactive)),
    page.titleBlock ? titleBlockSvg(page, pageNumber, document.pages.length) : '',
    '</svg>',
  ].join('');
};
