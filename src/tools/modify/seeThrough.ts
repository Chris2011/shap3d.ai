// Groups and components shown see-through for a while, so what lies behind them can be seen and picked.
import type { Editor } from '../../engine/editor';
import type { Instance } from '../../core/model';

export class SeeThrough {
  private shown: { instance: Instance; look: ReturnType<Editor['viewer']['shownLook']> }[] = [];

  /** the instances with these ids at a third of their opacity, until `clear` */
  apply(editor: Editor, ids: Iterable<number>) {
    const viewer = editor.viewer;
    for (const id of ids) {
      const instance = editor.entities.instances.get(id);
      if (instance) {
        const look = viewer.shownLook(instance);
        this.shown.push({ instance, look });
        viewer.lookForDisplay(instance, { ...look, opacity: (look?.opacity ?? 1) * 0.35 });
      }
    }
  }
  /** back to the look they had before */
  clear(editor: Editor) {
    for (const { instance, look } of this.shown) {
      editor.viewer.lookForDisplay(instance, look);
    }
    this.shown = [];
  }
}
