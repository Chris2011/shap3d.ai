import { ref } from 'vue';
import { useEditor } from '../../../components/keys';
import { imageFiles, pictureFromFile, pictureOfView } from './pictures';
import { t } from '../../../i18n';

/** Pictures going along with the next chat message: picked, pasted, dropped, or a shot of the view. */
export const usePictureAttachments = () => {
  const editor = useEditor();
  const pictures = ref<string[]>([]);
  /** a file is dragged over the input */
  const dragging = ref(false);

  const add = async (files: Blob[]) => {
    for (const file of files) {
      try {
        pictures.value.push(await pictureFromFile(file));
      } catch {
        editor.toast(t('ai.chat.pictureFailed'));
      }
    }
  };
  const pick = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    await add([...(input.files ?? [])]);
    input.value = '';
  };
  const paste = (event: ClipboardEvent) => {
    const files = imageFiles(event.clipboardData);
    if (files.length) {
      event.preventDefault();
      void add(files);
    }
  };
  const drop = (event: DragEvent) => {
    dragging.value = false;
    void add(imageFiles(event.dataTransfer));
  };
  const attachView = async () => {
    pictures.value.push(await pictureOfView(editor));
  };

  return { pictures, dragging, pick, paste, drop, attachView };
};
