// The commands of the View menu.
import { theme, setTheme, setScene } from '../../theme';
import { openTour } from '../../components/tour';
import { openPalette } from '../../components/paletteState';
import { measureView } from '../measureView';
import { showPanel } from '../../components/panelState';
import type { CommandDefinition } from './types';
import { setFaceStyle } from './view';
import { gumballOn } from '../../tools/modify/gumball';

/** The commands of the View menu – in menu order */
export const VIEW_COMMANDS: CommandDefinition[] = [
  { id: 'themeDark', group: 'view', run: () => setTheme('dark'), checked: () => theme.mode === 'dark' },
  { id: 'themeLight', group: 'view', run: () => setTheme('light'), checked: () => theme.mode === 'light' },
  { id: 'themeSystem', group: 'view', run: () => setTheme('system'), checked: () => theme.mode === 'system' },
  { id: 'sceneNight', group: 'view', run: () => setScene('night'), checked: () => theme.scene === 'night' },
  { id: 'sceneDay', group: 'view', run: () => setScene('day'), checked: () => theme.scene === 'day' },
  { id: 'sceneAuto', group: 'view', run: () => setScene('auto'), checked: () => theme.scene === 'auto' },
  { id: 'tour', group: 'view', run: () => openTour() },
  { id: 'commandPalette', shortcut: 'Ctrl+Shift+P', group: 'view', run: () => openPalette() },
  { id: 'managePlugins', group: 'plugins', run: () => showPanel('plugins') },
  {
    id: 'toggleAxes',
    group: 'view',
    run: (editor) => {
      editor.model.settings.axes = !editor.model.settings.axes;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.axes,
  },
  {
    id: 'toggleGumball',
    group: 'view',
    run: (editor) => {
      gumballOn.value = !gumballOn.value;
      editor.invalidate();
    },
    checked: () => gumballOn.value,
  },
  {
    id: 'toggleRulers',
    group: 'view',
    run: (editor) => {
      measureView.rulers = !measureView.rulers;
      editor.invalidate();
    },
    checked: () => measureView.rulers,
  },
  {
    id: 'toggleGrid',
    group: 'view',
    run: (editor) => {
      measureView.grid = !measureView.grid;
      editor.invalidate();
    },
    checked: () => measureView.grid,
  },
  {
    id: 'toggleGridAxes',
    group: 'view',
    run: (editor) => {
      measureView.gridAxes = !measureView.gridAxes;
      editor.invalidate();
    },
    checked: () => measureView.gridAxes,
  },
  {
    id: 'toggleGridLabels',
    group: 'view',
    run: (editor) => {
      measureView.labels = !measureView.labels;
      editor.invalidate();
    },
    checked: () => measureView.labels,
  },
  {
    id: 'togglePeopleSize',
    group: 'view',
    run: (editor) => {
      measureView.people = !measureView.people;
      editor.invalidate();
    },
    checked: () => measureView.people,
  },
  {
    id: 'toggleSceneTabs',
    group: 'view',
    run: (editor) => {
      editor.model.settings.sceneTabs = !editor.model.settings.sceneTabs;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.sceneTabs,
  },
  {
    id: 'toggleGuides',
    group: 'view',
    run: (editor) => {
      editor.model.settings.guides = !editor.model.settings.guides;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.guides,
  },
  {
    id: 'toggleShadows',
    group: 'view',
    run: (editor) => {
      editor.model.settings.shadows = !editor.model.settings.shadows;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.shadows,
  },
  {
    id: 'toggleHidden',
    group: 'view',
    run: (editor) => {
      editor.model.settings.hiddenGeometry = !editor.model.settings.hiddenGeometry;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.hiddenGeometry,
  },
  {
    id: 'toggleSectionPlanes',
    group: 'view',
    run: (editor) => {
      editor.model.settings.sectionPlanes = !editor.model.settings.sectionPlanes;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.sectionPlanes,
  },
  {
    id: 'toggleSectionCuts',
    group: 'view',
    run: (editor) => {
      editor.model.settings.sectionCuts = !editor.model.settings.sectionCuts;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.sectionCuts,
  },
  {
    id: 'xray',
    shortcut: 'Alt+K',
    group: 'view',
    run: (editor) => {
      editor.model.settings.style.xray = !editor.model.settings.style.xray;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.style.xray,
  },
  {
    id: 'style-wireframe',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'wireframe'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'wireframe',
  },
  {
    id: 'style-hiddenline',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'hiddenline'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'hiddenline',
  },
  {
    id: 'style-shaded',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'shaded'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'shaded',
  },
  {
    id: 'style-textured',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'textured'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'textured',
  },
  {
    id: 'style-monochrome',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'monochrome'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'monochrome',
  },
];
