// The commands of the Edit menu and the solid tools.
import { snapping } from '../inference';
import type { Editor } from '../editor';
import { t } from '../../i18n';
import type { CommandDefinition } from './types';
import { makeGroup, explode, explodeSelectedToInputs, setLocked } from './groups';
import { deleteSelection, copySelection, paste, hideSelection, unhideAll, clearAll } from './edit';
import { reverseFaces, orientFaces, softenSelection, intersectSelection } from './faces';
import { flipSelection, alignSelection, distributeSelection } from './arrange';
import { treatSelectedEdges } from './edges';
import { setSelectionFlag } from '../selectionEdits';

/** the selected groups and components of the open context */
const selectedInstances = (editor: Editor) =>
  editor
    .selected()
    .filter((entityRef) => entityRef.kind === 'instance')
    .map((entityRef) => editor.entities.instances.get(entityRef.id))
    .filter((instance) => instance !== undefined);
import { runSolid } from './solids';

/** The commands of the Edit menu and the solid tools – in menu order */
export const EDIT_COMMANDS: CommandDefinition[] = [
  {
    id: 'undo',
    shortcut: 'Ctrl+Z',
    group: 'edit',
    run: (editor) => editor.undo(),
    enabled: (editor) => editor.ui.canUndo || editor.tool.busy(),
  },
  {
    id: 'redo',
    shortcut: 'Ctrl+Y',
    group: 'edit',
    run: (editor) => editor.redo(),
    enabled: (editor) => editor.ui.canRedo || editor.tool.busy(),
  },
  { id: 'cut', shortcut: 'Ctrl+X', group: 'edit', run: (editor) => copySelection(editor, true) },
  { id: 'copy', shortcut: 'Ctrl+C', group: 'edit', run: (editor) => copySelection(editor) },
  { id: 'paste', shortcut: 'Ctrl+V', group: 'edit', run: (editor) => paste(editor) },
  { id: 'pasteInPlace', group: 'edit', run: (editor) => paste(editor, true) },
  { id: 'delete', shortcut: 'Del', group: 'edit', run: deleteSelection },
  { id: 'clearAll', group: 'edit', run: clearAll },
  {
    id: 'deleteGuides',
    group: 'edit',
    run: (editor) =>
      editor.commit('commands.deleteGuides', () => {
        editor.model.guides = [];
      }),
  },
  {
    id: 'toggleSnapping',
    shortcut: 'F3',
    group: 'edit',
    run: (editor) => {
      snapping.value = !snapping.value;
      editor.toast(t(snapping.value ? 'toast.snappingOn' : 'toast.snappingOff'));
      editor.redraw();
    },
    checked: () => snapping.value,
  },
  { id: 'selectAll', shortcut: 'Ctrl+A', group: 'edit', run: (editor) => editor.selectAll() },
  { id: 'selectNone', shortcut: 'Ctrl+T', group: 'edit', run: (editor) => editor.clearSelection() },
  {
    id: 'invertSel',
    shortcut: 'Ctrl+Shift+I',
    group: 'edit',
    run: (editor) => {
      const cur = new Set(editor.selected().map((entityRef) => editor.key(entityRef)));
      editor.selectAll();
      editor.select(editor.selected().filter((entityRef) => !cur.has(editor.key(entityRef))));
    },
  },
  { id: 'hide', group: 'edit', run: hideSelection },
  { id: 'unhideAll', group: 'edit', run: unhideAll },
  { id: 'makeGroup', group: 'edit', run: (editor) => makeGroup(editor, false) },
  {
    id: 'makeComponent',
    shortcut: 'G',
    group: 'edit',
    run: async (editor) => {
      if (!editor.selected().length) {
        editor.toast(t('toast.nothingSelected'));
        return;
      }
      const componentName = await editor.prompt(t('prompt.componentName'), editor.model.uniqueDefName(t('names.component')));
      if (componentName != null) {
        makeGroup(editor, true, componentName);
      }
    },
  },
  { id: 'explode', group: 'edit', run: explode },
  {
    id: 'explodeToInputs',
    group: 'edit',
    run: explodeSelectedToInputs,
    enabled: (editor) =>
      editor
        .selected()
        .some((entityRef) => entityRef.kind === 'instance' && !!editor.entities.instances.get(entityRef.id)?.definition.procedure),
  },
  {
    id: 'editGroup',
    group: 'edit',
    run: (editor) => {
      const entityRef = editor.selected().find((x) => x.kind === 'instance');
      const instance = entityRef && editor.entities.instances.get(entityRef.id);
      if (instance) {
        editor.enterInstance(instance);
      }
    },
  },
  { id: 'closeGroup', group: 'edit', run: (editor) => editor.exitContext() },
  {
    id: 'makeUnique',
    group: 'edit',
    run: (editor) =>
      editor.commit('commands.makeUnique', () => {
        for (const entityRef of editor.selected()) {
          if (entityRef.kind === 'instance') {
            const instance = editor.entities.instances.get(entityRef.id);
            if (instance) {
              instance.definition = editor.model.cloneDefinition(instance.definition);
            }
          }
        }
      }),
  },
  {
    id: 'toggleHole',
    group: 'edit',
    // on for all selected groups, or off again when they all are holes
    run: (editor) => setSelectionFlag(editor, 'hole', !selectedInstances(editor).every((instance) => instance.hole)),
    checked: (editor) => {
      const instances = selectedInstances(editor);
      return instances.length > 0 && instances.every((instance) => instance.hole);
    },
  },
  { id: 'lock', group: 'edit', run: (editor) => setLocked(editor, true) },
  { id: 'unlock', group: 'edit', run: (editor) => setLocked(editor, false) },
  { id: 'reverseFaces', group: 'edit', run: reverseFaces },
  { id: 'orientFaces', group: 'edit', run: orientFaces },
  { id: 'soften', group: 'edit', run: (editor) => softenSelection(editor, true) },
  { id: 'unsoften', group: 'edit', run: (editor) => softenSelection(editor, false) },
  { id: 'intersect', group: 'edit', run: intersectSelection },
  { id: 'roundEdges', group: 'edit', run: (editor) => treatSelectedEdges(editor, 'round') },
  { id: 'chamferEdges', group: 'edit', run: (editor) => treatSelectedEdges(editor, 'chamfer') },
  { id: 'flipX', group: 'edit', run: (editor) => flipSelection(editor, 'x') },
  { id: 'flipY', group: 'edit', run: (editor) => flipSelection(editor, 'y') },
  { id: 'flipZ', group: 'edit', run: (editor) => flipSelection(editor, 'z') },
  ...(['x', 'y', 'z'] as const).flatMap((axis) => {
    const name = axis.toUpperCase();
    return [
      { id: `align${name}Min`, group: 'edit', run: (editor: Editor) => alignSelection(editor, axis, 'min') },
      { id: `align${name}Center`, group: 'edit', run: (editor: Editor) => alignSelection(editor, axis, 'center') },
      { id: `align${name}Max`, group: 'edit', run: (editor: Editor) => alignSelection(editor, axis, 'max') },
      { id: `distribute${name}`, group: 'edit', run: (editor: Editor) => distributeSelection(editor, axis) },
    ];
  }),
  // solid tools
  { id: 'solid-union', group: 'solids', run: (editor) => runSolid(editor, 'union') },
  { id: 'solid-subtract', group: 'solids', run: (editor) => runSolid(editor, 'subtract') },
  { id: 'solid-intersect', group: 'solids', run: (editor) => runSolid(editor, 'intersect') },
  { id: 'solid-outershell', group: 'solids', run: (editor) => runSolid(editor, 'outershell') },
  { id: 'solid-trim', group: 'solids', run: (editor) => runSolid(editor, 'trim') },
  { id: 'solid-split', group: 'solids', run: (editor) => runSolid(editor, 'split') },
];
