import {
  SCALES,
  changeDocument,
  drawingArea,
  loadDocument,
  newId,
  newPage,
  pageSize,
  type LayoutDocument,
  type LayoutPage,
  type ViewportElement,
} from './document';
import { pageSvg } from './render';
import { pluginContext, t, THREE } from './runtime';

/** A short fingerprint of the model without the layout itself – viewports render again when it changes. */
export const modelSignature = () => {
  const json = pluginContext().editor.model.toJSON();
  delete json.pluginData;
  const text = JSON.stringify(json);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${hash}`;
};

/**
 * The smallest standard scale at which the model fits into a frame of `width` × `height` mm when seen
 * along the camera of `camera` (parallel projection).
 */
const fittingScale = (camera: ViewportElement['camera'], width: number, height: number) => {
  const box = pluginContext().editor.model.root.bounds();
  if (box.isEmpty()) {
    return 100;
  }
  const position = new THREE.Vector3().fromArray(camera.position);
  const target = new THREE.Vector3().fromArray(camera.target);
  const forward = target.clone().sub(position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 0, 1));
  if (right.lengthSq() < 1e-9) {
    right.set(1, 0, 0); // straight down: x is right
  }
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  let spanRight = 0,
    spanUp = 0;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
  );
  for (const a of corners) {
    for (const b of corners) {
      spanRight = Math.max(spanRight, Math.abs(a.clone().sub(b).dot(right)));
      spanUp = Math.max(spanUp, Math.abs(a.clone().sub(b).dot(up)));
    }
  }
  // metres per paper millimetre needed, with a little air around the model
  const needed = Math.max(spanRight / width, spanUp / height) * 1.15 * 1000 || 1;
  return SCALES.find((scale) => scale >= needed) ?? SCALES[SCALES.length - 1];
};

/** a viewport filling `area`, showing a scene (parallel scenes get a scale that fits) or the current view */
export const newViewport = (area: { x: number; y: number; w: number; h: number }, sceneId: number | null): ViewportElement => {
  const editor = pluginContext().editor;
  const scene = sceneId != null ? editor.model.scenes.find((candidate) => candidate.id === sceneId) : undefined;
  const camera = scene?.camera ?? editor.viewer.rig.getState();
  return {
    id: newId(),
    type: 'viewport',
    ...area,
    sceneId: scene ? scene.id : null,
    camera: JSON.parse(JSON.stringify(camera)),
    scale: camera.ortho ? fittingScale(camera, area.w, area.h) : null,
    render: 'hybrid',
  };
};

/** a new sheet with every scene of the model in a grid (up to 2 × 2 per sheet); returns the first new page */
export const sheetsFromScenes = (document: LayoutDocument) => {
  const scenes = pluginContext().editor.model.scenes;
  const created: LayoutPage[] = [];
  for (let start = 0; start < Math.max(scenes.length, 1); start += 4) {
    const group = scenes.slice(start, start + 4);
    const page = newPage(
      group.length ? group.map((scene) => scene.name).join(' · ') : t('layout.defaultSheet', { number: document.pages.length + 1 }),
    );
    const area = drawingArea(page);
    const columns = group.length > 1 ? 2 : 1;
    const rows = group.length > 2 ? 2 : 1;
    const gap = 8;
    const cellWidth = (area.w - gap * (columns - 1)) / columns;
    const cellHeight = (area.h - gap * (rows - 1)) / rows;
    const sources = group.length ? group.map((scene) => scene.id as number | null) : [null];
    sources.forEach((sceneId, i) => {
      const cell = {
        x: area.x + (i % columns) * (cellWidth + gap),
        y: area.y + Math.floor(i / columns) * (cellHeight + gap),
        w: cellWidth,
        h: cellHeight - 7,
      };
      // the title under the frame follows the scale when it changes
      page.elements.push({ ...newViewport(cell, sceneId), caption: group[i]?.name ?? t('layout.currentView') });
    });
    document.pages.push(page);
    created.push(page);
  }
  return created[0];
};

export const addSheetFromScenes = () => {
  let first: LayoutPage | undefined;
  changeDocument((document) => {
    first = sheetsFromScenes(document);
  }, 'layout.undo.fromScenes');
  return first;
};

// ------------------------------------------------------------ export and print
const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'layout'; // i18n-ignore – file name

export const exportPageSvg = (page: LayoutPage) => {
  const document = loadDocument();
  const own = document.pages.find((candidate) => candidate.id === page.id) ?? page;
  const svg = pageSvg(document, own, modelSignature());
  download(`${safeName(`${pluginContext().editor.model.name} - ${page.name}`)}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
};

/** every sheet in its paper size, in a hidden frame – the print dialog can save it as PDF */
export const printSheets = () => {
  const document = loadDocument();
  if (!document.pages.length) {
    return;
  }
  const signature = modelSignature();
  const pages = document.pages
    .map((page) => {
      const [width, height] = pageSize(page);
      return `<section style="width:${width}mm;height:${height}mm;page:p${page.id}">${pageSvg(document, page, signature)}</section>`;
    })
    .join('');
  const pageRules = document.pages
    .map((page) => {
      const [width, height] = pageSize(page);
      return `@page p${page.id} { size: ${width}mm ${height}mm; margin: 0; }`;
    })
    .join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${pluginContext().editor.model.name}</title><style>
${pageRules}
html, body { margin: 0; padding: 0; }
section { overflow: hidden; break-after: page; }
section:last-child { break-after: auto; }
section svg { display: block; width: 100%; height: 100%; }
</style></head><body>${pages}</body></html>`;
  const frame = window.document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  window.document.body.appendChild(frame);
  const frameDocument = frame.contentDocument!;
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 300);
};
