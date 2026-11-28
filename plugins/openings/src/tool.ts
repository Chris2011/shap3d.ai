import type { Vector3 } from 'three';
import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import type { FaceHit } from '../../../src/engine/viewer';
import { openingPlace, placeOpening } from './place';
import { pluginContext, t } from './runtime';
import { currentDraft } from './state';

/**
 * The tool "Set into wall": the opening's outline follows the pointer on a vertical wall face – green where it fits,
 * red where not – and a click cuts it through the wall and sets the window or door in. Esc stops.
 */
export const TOOL_ID = 'openings.place';

export const createPlaceTool = (editor: Editor) => {
  const context = pluginContext();
  const Base = context.classes.Tool;

  return new (class PlaceTool extends Base {
    id = TOOL_ID;
    name = 'openings.tool.name';
    cursor = 'crosshair';
    private hit: FaceHit | null = null;
    private preview: { corners: Vector3[]; fits: boolean } | null = null;

    status() {
      return t('openings.tool.status');
    }

    /** the pointer's spot in the hit face's own coordinates */
    private localPoint(hit: FaceHit) {
      return hit.point.clone().applyMatrix4(hit.context.world.clone().invert());
    }

    onMove(event: PEvt) {
      // the pieces of an opening are not walls
      const hit = editor.viewer.pickFace(
        event.x,
        event.y,
        (found) => !found.path.some((instance) => context.data.get(instance.definition)),
      );
      this.hit = hit;
      const place = hit && openingPlace(hit.context.entities, hit.faceId, this.localPoint(hit), currentDraft());
      this.preview =
        hit && place && !('error' in place)
          ? { corners: place.corners.map((corner) => corner.clone().applyMatrix4(hit.context.world)), fits: place.fits }
          : null;
      editor.redraw();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      this.onMove(event);
      const hit = this.hit;
      if (!hit) {
        return;
      }
      const result = placeOpening(context, hit.context.entities, hit.faceId, this.localPoint(hit), { ...currentDraft() });
      if ('error' in result) {
        context.ui.toast(t(`openings.errors.${result.error}`));
        return;
      }
      this.preview = null;
      editor.redraw();
    }

    cancel() {
      this.hit = null;
      this.preview = null;
      editor.redraw();
    }

    draw(overlay: Overlay) {
      if (this.preview) {
        const colour = this.preview.fits ? '#16a34a' : '#d92d20';
        overlay.fillPolygon(this.preview.corners, `${colour}33`);
        overlay.polyline(this.preview.corners, colour, 2, true);
      }
    }
  })(editor);
};
