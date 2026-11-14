import type { ModelSettings } from '../core/document';
import { useEditor } from '../components/keys';
import { useLiveEdit } from './useLiveEdit';

/** Setter for one model setting (units, shadows …). Settings are no undo step, as in SketchUp's Model Info. */
export const useModelSettings = () => {
  const editor = useEditor();
  const liveEdit = useLiveEdit();
  return <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) =>
    liveEdit(() => {
      editor.model.settings[key] = value;
    });
};
