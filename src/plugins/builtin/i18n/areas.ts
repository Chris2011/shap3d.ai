import { computed } from 'vue';
import { t, localize, messageLayers, SOURCE_LANGUAGE } from '../../../i18n';
import { plugins } from '../../registry';
import { PANEL_INFO } from '../../../components/panelState';
import { TOOL_INFO } from '../../../engine/setup';

/**
 * Areas of the translation editor, each with an icon so it is easy to recognise.
 * The app's own texts are grouped by their first key part (names: `i18n.areas.<id>`).
 * Plugins bring and register their texts themselves – each plugin is an area of its own,
 * named and pictured from what the plugin registered (its name, the icon of its panel or tool).
 */
export interface Area {
  id: string;
  icon: string;
  label: string;
}

const APP_AREAS: { id: string; icon: string; prefixes: string[] }[] = [
  { id: 'tools', icon: 'line', prefixes: ['tools', 'vcb', 'inference', 'measure', 'navigation'] },
  { id: 'instructor', icon: 'instructor', prefixes: ['instructor'] },
  { id: 'menu', icon: 'menu', prefixes: ['menu', 'commands', 'groups', 'brand'] },
  { id: 'interface', icon: 'select', prefixes: ['app', 'topbar', 'theme', 'toolbar', 'contextMenu', 'keys', 'i18n'] },
  { id: 'palette', icon: 'search', prefixes: ['palette'] },
  { id: 'statusbar', icon: 'mouse', prefixes: ['statusbar', 'editor'] },
  { id: 'dialogs', icon: 'help', prefixes: ['dialogs', 'common', 'confirm', 'prompt'] },
  { id: 'messages', icon: 'file', prefixes: ['toast', 'undo', 'import', 'names', 'units', 'errors'] },
  { id: 'entityinfo', icon: 'entityinfo', prefixes: ['entityInfo'] },
  { id: 'components', icon: 'component', prefixes: ['components', 'library'] },
  { id: 'materials', icon: 'materials', prefixes: ['materials', 'textures'] },
  { id: 'styles', icon: 'styles', prefixes: ['styles'] },
  { id: 'tags', icon: 'tags', prefixes: ['tags'] },
  { id: 'shadows', icon: 'shadows', prefixes: ['shadows'] },
  { id: 'scenes', icon: 'scenes', prefixes: ['scenes'] },
  { id: 'display', icon: 'display', prefixes: ['display'] },
  { id: 'soften', icon: 'soften', prefixes: ['soften'] },
  { id: 'mesh', icon: 'mesh', prefixes: ['mesh', 'shapes'] },
  { id: 'modelinfo', icon: 'modelinfo', prefixes: ['modelInfo'] },
  { id: 'outliner', icon: 'outliner', prefixes: ['outliner'] },
  { id: 'panels', icon: 'more', prefixes: ['panels'] },
  { id: 'scripts', icon: 'script', prefixes: ['scriptEditor', 'apiReference', 'api', 'completion', 'examples', 'script', 'codeExport'] },
  { id: 'plugins', icon: 'plugin', prefixes: ['plugins', 'pluginManager'] },
  { id: 'tour', icon: 'play', prefixes: ['tour', 'splash'] },
];
const APP_AREA_OF = new Map(APP_AREAS.flatMap((area) => area.prefixes.map((prefix) => [prefix, area] as const)));
const OTHER = { id: 'other', icon: 'more' };

/** which source registered the German text of a key: 'app' or a plugin id */
const sources = computed(() => {
  const map = new Map<string, string>();
  for (const layer of messageLayers()) {
    if (layer.language === SOURCE_LANGUAGE) {
      for (const key in layer.messages) {
        map.set(key, layer.source);
      }
    }
  }
  return map;
});

/** a plugin's icon: the one of its panel or tool, otherwise the plugin icon */
const pluginIcon = (id: string) =>
  PANEL_INFO.find((panel) => panel.id.startsWith(`${id}.`))?.icon ??
  Object.values(TOOL_INFO).find((tool) => tool.id.startsWith(`${id}.`))?.icon ??
  'plugin';

export const areaOf = (key: string): Area => {
  const source = sources.value.get(key) ?? 'app';
  if (source !== 'app') {
    const entry = plugins.find((plugin) => plugin.id === source);
    return { id: `plugin:${source}`, icon: pluginIcon(source), label: entry ? localize(entry.name) : source };
  }
  const area = APP_AREA_OF.get(key.split('.')[0]) ?? OTHER;
  return { id: area.id, icon: area.icon, label: t(`i18n.areas.${area.id}`) };
};

/** order: the app's areas as listed, then the plugins */
export const areaOrder = (id: string) => {
  const index = APP_AREAS.findIndex((area) => area.id === id);
  return index >= 0 ? index : id === OTHER.id ? APP_AREAS.length : APP_AREAS.length + 1;
};
