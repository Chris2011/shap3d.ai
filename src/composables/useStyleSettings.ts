import type { StyleSettings } from '../core/document';
import { useEditor } from '../components/keys';
import { useModel } from './useModel';
import { useLiveEdit } from './useLiveEdit';

/**
 * The model's display style, as a fresh copy per change (so shown values follow), and a live setter
 * (no undo step, as in SketchUp's Styles).
 */
export const useStyleSettings = () => {
  const editor = useEditor();
  const liveEdit = useLiveEdit();
  const style = useModel(() => ({ ...editor.model.settings.style }));
  const setStyle = <K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) =>
    liveEdit(() => {
      editor.model.settings.style[key] = value;
    });
  return { style, setStyle };
};
