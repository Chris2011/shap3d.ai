import { localize, t } from '../../i18n';
import type { Instance } from '../../core/model';
import { createSnapshotPacker, HISTORY_BUDGET_BYTES, unpackSnapshot } from '../history';
import { EditorTools } from './editorTools';
import type { HistoryEntry } from './tool';

/** The undo history: steps (commit), long-running operations (Move's preview), undo and redo. */
export abstract class EditorHistory extends EditorTools {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private packSnapshot = createSnapshotPacker();
  private commitDepth = 0;

  private snapshot() {
    return this.model.toJSON();
  }
  /** Run a modelling operation as one undoable step. */
  commit<T>(label: string, action: () => T): T {
    const snap = this.snapshot();
    const path = this.activePath.map((instance) => instance.id);
    let result: T;
    this.commitDepth++;
    try {
      result = action();
      if (this.commitDepth === 1) {
        this.settle();
      }
    } catch (error) {
      this.restore(snap, path);
      // a script that waits for something and runs again has not failed
      if (!(error as { retryAfter?: unknown }).retryAfter) {
        console.error(error);
        this.toast(t('editor.error', { message: localize((error as Error).message) }));
      }
      throw error;
    } finally {
      this.commitDepth--;
    }
    this.redoStack = [];
    this.pushUndo(label, snap, path);
    this.changed();
    return result;
  }
  /** a new undo step; the oldest ones go when there are too many or they take too much memory */
  private pushUndo(label: string, snap: any, path: number[]) {
    this.undoStack.push({ label, snap: this.packSnapshot(snap), path });
    let bytes = 0;
    for (const entry of [...this.undoStack, ...this.redoStack]) {
      bytes += entry.snap.bytes;
    }
    while (this.undoStack.length > 1 && (this.undoStack.length > 100 || bytes > HISTORY_BUDGET_BYTES)) {
      bytes -= this.undoStack.shift()!.snap.bytes;
    }
  }
  /** inside an undo step (commit or a long-running operation)? */
  changing() {
    return this.commitDepth > 0 || !!this.operation;
  }
  private settle() {
    for (const listener of [...this.settling]) {
      listener();
    }
  }
  changed() {
    this.ui.saved = false;
    this.updateHistoryUi();
    this.invalidate();
  }

  /** Long-running interactive operation (move/rotate preview): snapshot now, finish later. */
  private operation: { label: string; snap: any; path: number[] } | null = null;
  beginOp(label: string) {
    if (this.operation) {
      this.abortOp();
    }
    this.operation = { label, snap: this.snapshot(), path: this.activePath.map((instance) => instance.id) };
  }
  get opSnapshot() {
    return this.operation?.snap;
  }
  endOp() {
    if (!this.operation) {
      return;
    }
    this.settle();
    this.redoStack = [];
    this.pushUndo(this.operation.label, this.operation.snap, this.operation.path);
    this.operation = null;
    this.changed();
  }
  abortOp() {
    if (!this.operation) {
      return;
    }
    const pending = this.operation;
    this.operation = null;
    this.restore(pending.snap, pending.path);
  }
  inOp() {
    return !!this.operation;
  }
  private restore(snap: any, path: number[]) {
    this.model.load(snap);
    // re-resolve the editing context by instance ids
    const newPath: Instance[] = [];
    let ents = this.model.root;
    for (const id of path) {
      const instance = ents.instances.get(id);
      if (!instance) {
        break;
      }
      newPath.push(instance);
      ents = instance.definition.entities;
    }
    this.activePath = newPath;
    this.updateContextName();
    this.pruneSelection();
    this.selectionChanged();
    this.invalidate();
  }
  /** Replaces the whole model with a snapshot and re-resolves the context – undo and scripts that built in a worker use this. */
  restoreModel(snap: any, path: number[] = this.activePath.map((instance) => instance.id)) {
    this.restore(snap, path);
  }
  /** a tool in the middle of an action: undo and redo end that action first, the history stays as it is */
  private cancelAction() {
    if (!this.tool.busy()) {
      return false;
    }
    this.tool.cancel();
    this.refreshStatus();
    this.redraw();
    this.toast(t('editor.actionCancelled'));
    return true;
  }
  undo() {
    if (this.cancelAction()) {
      return;
    }
    const entry = this.undoStack.pop();
    if (!entry) {
      return;
    }
    this.redoStack.push({
      label: entry.label,
      snap: this.packSnapshot(this.snapshot()),
      path: this.activePath.map((instance) => instance.id),
    });
    this.restore(unpackSnapshot(entry.snap), entry.path);
    this.updateHistoryUi();
    this.toast(t('editor.undone', { action: localize(entry.label) }));
  }
  redo() {
    if (this.cancelAction()) {
      return;
    }
    const entry = this.redoStack.pop();
    if (!entry) {
      return;
    }
    this.undoStack.push({
      label: entry.label,
      snap: this.packSnapshot(this.snapshot()),
      path: this.activePath.map((instance) => instance.id),
    });
    this.restore(unpackSnapshot(entry.snap), entry.path);
    this.updateHistoryUi();
    this.toast(t('editor.redone', { action: localize(entry.label) }));
  }
  private updateHistoryUi() {
    this.ui.canUndo = this.undoStack.length > 0;
    this.ui.canRedo = this.redoStack.length > 0;
    this.ui.undoLabel = this.undoStack[this.undoStack.length - 1]?.label ?? '';
    this.ui.redoLabel = this.redoStack[this.redoStack.length - 1]?.label ?? '';
  }
  /** hands over the undo steps, for a model that goes out of view (`modelTabs`) */
  takeHistory() {
    const history = { undo: this.undoStack, redo: this.redoStack };
    this.undoStack = [];
    this.redoStack = [];
    return history;
  }
  restoreHistory(history: { undo: HistoryEntry[]; redo: HistoryEntry[] }) {
    this.undoStack = history.undo;
    this.redoStack = history.redo;
    this.updateHistoryUi();
  }
  resetHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateHistoryUi();
  }
}
