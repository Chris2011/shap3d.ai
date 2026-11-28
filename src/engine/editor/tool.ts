// The base of every tool, the editor's reactive UI state and the small types around them.
import type { PackedSnapshot } from '../history';
import type { Overlay } from '../overlay';
import type { Editor } from '../editor';

/** Tools of SketchUp Web's main toolbar (others appear as recently used tools). */
export const MAIN_TOOLS = ['select', 'eraser', 'line', 'rectangle', 'pushpull', 'move', 'rotate', 'scale', 'paint', 'orbit', 'pan', 'tape'];

export interface PEvt {
  x: number;
  y: number;
  button: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  detail: number;
}

export abstract class Tool {
  abstract id: string;
  abstract name: string;
  cursor = 'default';
  vcbLabel = '';
  /** how many states the Ctrl key steps through in this tool – to go back when Ctrl was the start of a shortcut */
  ctrlStates = 2;
  /** its preview shows its sizes at the geometry itself – the measurements value beside the cursor is left out */
  showsSizes = false;
  constructor(public editor: Editor) {}
  status(): string {
    return '';
  }
  activate() {}
  deactivate() {}
  onDown(_event: PEvt) {}
  onMove(_event: PEvt) {}
  onUp(_event: PEvt) {}
  onDblClick(_event: PEvt) {}
  onKey(_event: KeyboardEvent, _down: boolean): boolean {
    return false;
  }
  onVcb(_text: string): boolean {
    return false;
  }
  draw(_overlay: Overlay) {}
  /** Esc */
  cancel() {}
  /** true while the tool is in the middle of an operation (Esc resets, nav keeps state) */
  busy() {
    return false;
  }
}

export interface UiState {
  tool: string;
  status: string;
  vcbLabel: string;
  vcbValue: string;
  vcbEditing: boolean;
  revision: number; // model revision – panels re-read
  selRev: number; // selection revision
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  currentMaterial: string | null;
  contextName: string;
  toast: string;
  saved: boolean;
  renderer: string;
  projection: 'persp' | 'ortho';
  dialog: null | { kind: string; data?: any };
  recentTools: string[];
  /** bumped when a tool is registered or removed (plugins) – the toolbars re-check what exists */
  toolsRevision: number;
}

/** a question in `askOptions`: a choice or a checkbox */
export interface DialogOption {
  id: string;
  /** text or message key */
  label: string;
  value: string | boolean;
  /** with these it is a choice, else a checkbox */
  choices?: { value: string; label: string }[];
}

export interface HistoryEntry {
  label: string;
  snap: PackedSnapshot;
  path: number[];
}
