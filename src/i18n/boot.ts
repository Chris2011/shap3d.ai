import bootEnglish from './boot.en.json';

/**
 * Texts of the loading screen. It shows before the editor and its plugins (with the language
 * packs) are loaded, so the i18n core keeps the active language's `brand.*` and `splash.*`
 * texts in the browser; without them (first start, English) the English texts are used.
 */
export const BOOT_CACHE = 's3d:boot-messages';
/** keys the loading screen needs (cached for the next start) */
export const isBootKey = (key: string) => key.startsWith('brand.') || key.startsWith('splash.');

const flatten = (tree: Record<string, unknown>, prefix = '', out: Record<string, string> = {}) => {
  for (const [key, value] of Object.entries(tree)) {
    if (value && typeof value === 'object') {
      flatten(value as Record<string, unknown>, `${prefix}${key}.`, out);
    } else {
      out[prefix + key] = String(value);
    }
  }
  return out;
};
const english = flatten(bootEnglish.messages);
const cached: Record<string, string> = (() => {
  try {
    return JSON.parse(localStorage.getItem(BOOT_CACHE) ?? '{}').messages ?? {};
  } catch {
    return {};
  }
})();

/** Text for the loading screen: cached translation → English → key; fills {name} placeholders. */
export const bootText = (key: string, params: Record<string, string> = {}) =>
  (cached[key] || english[key] || key).replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder);
