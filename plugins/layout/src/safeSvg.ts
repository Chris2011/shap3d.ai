/**
 * Sheets come from model files anyone can hand around, and their SVG goes into the page, into exported files and into
 * the print frame. Whatever a file slips into a value: only drawing elements and attributes stay. Not valid XML (a value
 * that tried to break out of its attribute) gives nothing at all.
 */
const ALLOWED = new Set(
  'svg g defs rect circle ellipse line path polygon polyline text tspan image clipPath pattern marker linearGradient radialGradient stop title'
    .split(' ')
    .map((name) => name.toLowerCase()),
);

const isSafeAddress = (value: string) => /^(#|data:image\/(png|jpe?g|gif|webp|bmp)[;,])/i.test(value.trim());

const clean = (element: Element) => {
  for (const child of [...element.children]) {
    if (ALLOWED.has(child.localName.toLowerCase())) {
      clean(child);
    } else {
      child.remove();
    }
  }
  for (const attribute of [...element.attributes]) {
    const name = attribute.localName.toLowerCase();
    const address = name === 'href' || name === 'src';
    if (name.startsWith('on') || name === 'style' || (address && !isSafeAddress(attribute.value))) {
      element.removeAttributeNode(attribute);
    }
  }
};

export const safeSvg = (markup: string) => {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) {
    return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  }
  clean(root);
  return new XMLSerializer().serializeToString(root);
};
