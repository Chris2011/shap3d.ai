// The commands of the Camera menu.
import type { Editor } from '../editor';
import type { CommandDefinition } from './types';
import { zoomSelection, isStandardView } from './view';

/** The commands of the Camera menu – in menu order */
export const CAMERA_COMMANDS: CommandDefinition[] = [
  { id: 'zoomExtents', shortcut: 'Shift+Z', group: 'camera', run: (editor) => editor.zoomExtents() },
  { id: 'zoomSelection', group: 'camera', run: zoomSelection },
  {
    id: 'persp',
    group: 'camera',
    separator: true,
    run: (editor) => {
      editor.viewer.rig.isOrtho = false;
      editor.ui.projection = 'persp';
      editor.viewer.rig.syncOrtho();
      editor.redraw();
    },
    checked: (editor) => !editor.viewer?.rig.isOrtho,
  },
  {
    id: 'ortho',
    group: 'camera',
    run: (editor) => {
      editor.viewer.rig.isOrtho = true;
      editor.ui.projection = 'ortho';
      editor.viewer.rig.syncOrtho();
      editor.redraw();
    },
    checked: (editor) => !!editor.viewer?.rig.isOrtho,
  },
  ...(['iso', 'top', 'front', 'right', 'back', 'left', 'bottom'] as const).map((view) => ({
    id: 'view-' + view,
    group: 'camera',
    separator: view === 'iso',
    run: (editor: Editor) => editor.viewer.rig.standardView(view, editor.model.bounds()),
    checked: (editor: Editor) => isStandardView(editor, view),
  })),
];
