import { reactive } from 'vue';
import { FONTS, forgetFont, type TextFont } from './fonts';

/** id of the tool (plugin id + tool id) – opening it shows the dialog */
export const TEXT_TOOL = 'text3d.text';

/** the 3D-text dialog: open while the tool is active; the form is kept for the next text */
export const textDialog = reactive({
  open: false,
  form: { text: 'Text', font: 'helvetiker', size: '1m', depth: '0,2m', filled: true, upright: true },
});

/** where the user's own fonts are kept – set by the plugin (its file storage) */
interface FontStorage {
  list: () => Promise<{ path: string }[]>;
  get: (path: string) => Promise<Blob | undefined>;
  put: (path: string, file: Blob) => Promise<void>;
  remove: (path: string) => Promise<void>;
}
let storage: FontStorage | null = null;
const FONT_DIR = 'fonts/';
const FONT_FILE = /\.(ttf|otf|woff)$/i;

const customFont = (path: string, file: Blob): TextFont => {
  const name = path.slice(FONT_DIR.length).replace(FONT_FILE, '');
  return { id: `eigene:${name.toLowerCase().replace(/\s+/g, '-')}`, label: name, category: 'Eigene', file };
};

/** Loads the user's fonts from the plugin storage into the font list. */
export const initCustomFonts = async (fileStorage: FontStorage) => {
  storage = fileStorage;
  for (const { path } of await fileStorage.list()) {
    if (!path.startsWith(FONT_DIR) || !FONT_FILE.test(path)) continue;
    const file = await fileStorage.get(path);
    if (file) FONTS.push(customFont(path, file));
  }
};

/** Removes the user's fonts from the list again (plugin switched off). */
export const dropCustomFonts = () => {
  for (const font of FONTS.filter(candidate => candidate.category === 'Eigene')) { forgetFont(font.id); FONTS.splice(FONTS.indexOf(font), 1); }
};

/** Adds a TTF/OTF/WOFF file as a font (kept in the browser) and returns its id. */
export const addCustomFont = async (file: File) => {
  if (!FONT_FILE.test(file.name)) throw new Error('Bitte eine TTF-, OTF- oder WOFF-Datei wählen (WOFF2 geht nicht)');
  const path = FONT_DIR + file.name;
  await storage?.put(path, file);
  const font = customFont(path, file);
  const existing = FONTS.findIndex(candidate => candidate.id === font.id);
  if (existing >= 0) { forgetFont(font.id); FONTS.splice(existing, 1, font); } else FONTS.push(font);
  return font.id;
};

export const removeCustomFont = async (id: string) => {
  const font = FONTS.find(candidate => candidate.id === id && candidate.category === 'Eigene'); if (!font) return;
  for (const { path } of (await storage?.list()) ?? []) if (customFont(path, font.file!).id === id) await storage?.remove(path);
  forgetFont(id); FONTS.splice(FONTS.indexOf(font), 1);
};
