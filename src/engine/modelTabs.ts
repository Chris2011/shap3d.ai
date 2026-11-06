import { reactive } from 'vue';
import type { Editor } from './editor';
import { t } from '../i18n';

/** A model that is not shown right now: its text, undo steps and view. */
interface ParkedModel {
  text: string;
  history: ReturnType<Editor['takeHistory']>;
  camera: ReturnType<Editor['viewer']['rig']['getState']>;
  saved: boolean;
}
interface ModelTab {
  id: number;
  name: string;
  /** missing on the tab shown */
  parked?: ParkedModel;
}

/**
 * Several models open at once. One editor shows one model; the others wait as text, with their own undo steps and view.
 * shortcut: autosave only covers the tab shown; keep the others in storage too if people lose work on reload.
 */
export const modelTabs = reactive({ list: [] as ModelTab[], active: 0 });

let nextTabId = 1;

/** the tab shown, made on first use */
const shownTab = (editor: Editor) => {
  let tab = modelTabs.list.find((candidate) => candidate.id === modelTabs.active);
  if (!tab) {
    tab = { id: nextTabId++, name: editor.model.name };
    modelTabs.list.push(tab);
    modelTabs.active = tab.id;
  }
  return tab;
};

const park = (editor: Editor) => {
  const tab = shownTab(editor);
  tab.name = editor.model.name;
  tab.parked = {
    text: JSON.stringify(editor.model.toJSON()),
    history: editor.takeHistory(),
    camera: editor.viewer.rig.getState(),
    saved: editor.ui.saved,
  };
};

export const openNewTab = (editor: Editor) => {
  editor.setTool('select');
  park(editor);
  const tab: ModelTab = { id: nextTabId++, name: '' };
  modelTabs.list.push(tab);
  modelTabs.active = tab.id;
  editor.newModel();
  tab.name = editor.model.name;
};

const unpark = (editor: Editor, tab: ModelTab) => {
  const { text, history, camera, saved } = tab.parked!;
  tab.parked = undefined;
  modelTabs.active = tab.id;
  editor.loadJSON(JSON.parse(text));
  editor.restoreHistory(history);
  editor.viewer.rig.applyState(camera, false);
  editor.ui.saved = saved;
};

export const switchTab = (editor: Editor, id: number) => {
  const tab = modelTabs.list.find((candidate) => candidate.id === id);
  if (tab?.parked) {
    editor.setTool('select');
    park(editor);
    unpark(editor, tab);
  }
};

export const closeTab = async (editor: Editor, id: number) => {
  const tab = modelTabs.list.find((candidate) => candidate.id === id);
  if (!tab || modelTabs.list.length < 2) {
    return;
  }
  const saved = tab.parked ? tab.parked.saved : editor.ui.saved;
  if (!saved && !(await editor.confirm(t('confirm.discardChanges')))) {
    return;
  }
  const index = modelTabs.list.indexOf(tab);
  modelTabs.list.splice(index, 1);
  if (!tab.parked) {
    editor.setTool('select');
    unpark(editor, modelTabs.list[Math.max(0, index - 1)]);
  }
};
