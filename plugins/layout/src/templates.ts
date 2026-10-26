import { newId, newPage, type LayoutPage } from './document';
import { copied } from './elements';
import { pluginContext } from './runtime';

/**
 * Templates: sheets saved for later – paper, title block and everything on them (a company frame, a legend,
 * empty viewports). They live in the browser (the plugin's storage), not in the model, so every model can use
 * them. One template can be the default for new sheets.
 */
export interface SheetTemplate {
  id: string;
  name: string;
  page: LayoutPage;
}

const storage = () => pluginContext().storage;

export const loadTemplates = (): SheetTemplate[] => storage().get<SheetTemplate[]>('templates', []);
export const defaultTemplateId = (): string | null => storage().get<string | null>('defaultTemplate', null);

export const saveTemplate = (name: string, page: LayoutPage) => {
  const template: SheetTemplate = { id: newId(), name, page: JSON.parse(JSON.stringify(page)) };
  storage().set('templates', [...loadTemplates(), template]);
  return template;
};

export const removeTemplate = (id: string) => {
  storage().set(
    'templates',
    loadTemplates().filter((template) => template.id !== id),
  );
  if (defaultTemplateId() === id) {
    storage().set('defaultTemplate', null);
  }
};

export const setDefaultTemplate = (id: string | null) => storage().set('defaultTemplate', id);

/** a new sheet from a template (new ids for it and its elements) – or an empty A3 sheet */
export const sheetFrom = (template: SheetTemplate | undefined, name: string): LayoutPage =>
  template
    ? { ...JSON.parse(JSON.stringify(template.page)), id: newId(), name, elements: template.page.elements.map(copied) }
    : newPage(name);
