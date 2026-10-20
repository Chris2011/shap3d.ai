/**
 * "Where is this text?" – finds the elements that currently show a text (content, title,
 * placeholder, aria-label) and outlines them for a moment. Texts with {placeholders} are
 * matched by their longest fixed part.
 */
const ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'label'];
const FLASH_MS = 2600;

const searchPart = (text: string) =>
  text
    .split(/\{\w+\}|\|/)
    .map((part) => part.trim())
    .sort((first, second) => second.length - first.length)[0] ?? '';

const outline = (element: Element) => {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return false;
  }
  const box = document.createElement('div');
  box.className = 's3d-i18n-flash';
  Object.assign(box.style, {
    position: 'fixed',
    left: `${rect.left - 3}px`,
    top: `${rect.top - 3}px`,
    width: `${rect.width + 6}px`,
    height: `${rect.height + 6}px`,
    border: '2px solid #ff9f1a',
    borderRadius: '4px',
    boxShadow: '0 0 0 4px rgba(255,159,26,.35)',
    zIndex: '10000',
    pointerEvents: 'none',
    transition: 'opacity .4s',
    opacity: '1',
  });
  document.body.appendChild(box);
  setTimeout(() => {
    box.style.opacity = '0';
  }, FLASH_MS - 400);
  setTimeout(() => box.remove(), FLASH_MS);
  return true;
};

/** Outlines every visible element that shows `text` (outside `exclude`); returns how many were found. */
export const flashText = (text: string, exclude?: Element | null) => {
  const needle = searchPart(text);
  if (needle.length < 2) {
    return 0;
  }
  const found = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && node.textContent?.includes(needle) && !exclude?.contains(parent)) {
      found.add(parent);
    }
  }
  for (const attribute of ATTRIBUTES) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      if (!exclude?.contains(element) && element.getAttribute(attribute)?.includes(needle)) {
        found.add(element);
      }
    }
  }
  // inner elements are enough – drop ancestors of other matches
  const elements = [...found].filter((element) => ![...found].some((other) => other !== element && element.contains(other)));
  let shown = 0;
  for (const element of elements) {
    if (outline(element)) {
      shown++;
    }
  }
  return shown;
};
