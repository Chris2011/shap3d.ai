import { changeDocument, newId, type LayoutElement, type LayoutPage } from './document';
import { copied, moved } from './elements';
import { joinElements } from './geometry';

/**
 * Changes to the elements of one page – each call is one undo step of the app. The editor and the
 * properties panel share them.
 */

export const changePage = (pageId: string, change: (page: LayoutPage) => void, label?: string) =>
  changeDocument((document) => {
    const page = document.pages.find((candidate) => candidate.id === pageId);
    if (page) {
      change(page);
    }
  }, label);

/** changes the elements with these ids (their stored copies) */
export const changeElements = (pageId: string, ids: string[], change: (element: LayoutElement) => void) =>
  changePage(pageId, (page) => page.elements.filter((element) => ids.includes(element.id)).forEach(change));

/** replaces one element by others (trim, split, fillet …) – keeps its place in the drawing order */
export const replaceElement = (pageId: string, id: string, replacements: LayoutElement[], extra: LayoutElement[] = []) =>
  changePage(pageId, (page) => {
    const index = page.elements.findIndex((element) => element.id === id);
    if (index >= 0) {
      page.elements.splice(index, 1, ...replacements, ...extra);
    }
  });

export const addElements = (pageId: string, elements: LayoutElement[]) => changePage(pageId, (page) => page.elements.push(...elements));

export const removeElements = (pageId: string, ids: string[]) =>
  changePage(pageId, (page) => (page.elements = page.elements.filter((element) => !ids.includes(element.id))));

/** copies of the elements, shifted a little – returns their ids */
export const duplicateElements = (pageId: string, elements: LayoutElement[], shift = 5) => {
  const copies = elements.map((element) => moved(copied(element), shift, shift));
  addElements(pageId, copies);
  return copies.map((copy) => copy.id);
};

/** the selected elements become one group (in the place of the topmost of them); returns its id */
export const groupElements = (pageId: string, ids: string[]) => {
  const id = newId();
  changePage(pageId, (page) => {
    const members = page.elements.filter((element) => ids.includes(element.id));
    if (members.length < 2) {
      return;
    }
    const last = Math.max(...members.map((member) => page.elements.indexOf(member)));
    const rest = page.elements.filter((element) => !ids.includes(element.id));
    rest.splice(last - members.length + 1, 0, { id, type: 'group', elements: members });
    page.elements = rest;
  });
  return id;
};

/** a group becomes its elements again; returns their ids */
export const ungroupElement = (pageId: string, id: string) => {
  let ids: string[] = [];
  changePage(pageId, (page) => {
    const index = page.elements.findIndex((element) => element.id === id);
    const group = page.elements[index];
    if (group?.type === 'group') {
      page.elements.splice(index, 1, ...group.elements);
      ids = group.elements.map((element) => element.id);
    }
  });
  return ids;
};

/** lines and open paths that touch become one path; returns its id or null */
export const joinSelected = (pageId: string, elements: LayoutElement[]) => {
  const path = joinElements(elements);
  if (!path) {
    return null;
  }
  changePage(pageId, (page) => {
    const index = Math.min(...elements.map((element) => page.elements.findIndex((candidate) => candidate.id === element.id)));
    page.elements = page.elements.filter((element) => !elements.some((joined) => joined.id === element.id));
    page.elements.splice(index, 0, path);
  });
  return path.id;
};

/** to the front (drawn last) or to the back (drawn first) */
export const arrangeElements = (pageId: string, ids: string[], where: 'front' | 'back') =>
  changePage(pageId, (page) => {
    const chosen = page.elements.filter((element) => ids.includes(element.id));
    const rest = page.elements.filter((element) => !ids.includes(element.id));
    page.elements = where === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
  });
