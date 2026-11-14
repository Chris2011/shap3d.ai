import type { MaterialDef } from '../core/document';
import { useEditor } from '../components/keys';
import { pickFile } from '../engine/commands';
import { readImageFile } from '../utils/imageFile';
import { t } from '../i18n';

/** Puts a picture the user picks into a material – undoable, because it is saved with the model. */
export const useMaterialImage = () => {
  const editor = useEditor();
  return async (material: MaterialDef) => {
    const file = await pickFile('image/png,image/jpeg,image/webp,image/gif,image/bmp');
    if (!file) {
      return;
    }
    const image = await readImageFile(file).catch(() => null);
    if (!image) {
      editor.toast(t('materials.imageFailed', { name: file.name }));
      return;
    }
    editor.commit('undo.materialImage', () => {
      const first = !material.image;
      material.image = image.url;
      material.imageAspect = image.aspect;
      material.texture = material.shader = undefined;
      material.shaderParams = undefined;
      if (first) {
        material.textureSize = material.textureRotation = undefined;
        material.textureOffset = undefined;
      }
    });
  };
};
