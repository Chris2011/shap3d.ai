import type { Editor } from '../../../engine/editor';

/**
 * Pictures for the chat: a file the user picks, pastes or drops, or the current 3D view – scaled down to what vision
 * models read anyway (they work on ~1000 px), as JPEG, so the conversation and its history stay small.
 */

const LONGEST_SIDE = 1024;

const scaled = async (source: string) => {
  const image = new Image();
  image.src = source;
  await image.decode();
  const scale = Math.min(1, LONGEST_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d')!;
  // a see-through picture on white, as JPEG has no transparency
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
};

/** a picture file (or pasted / dropped image) as a data URL for the chat */
export const pictureFromFile = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => scaled(String(reader.result)).then(resolve, reject);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** the 3D view as it is now, as a data URL for the chat */
export const pictureOfView = (editor: Editor) => scaled(editor.viewer.snapshot());

/** the image files among dropped or pasted items */
export const imageFiles = (items: DataTransfer | null) => [...(items?.files ?? [])].filter((file) => file.type.startsWith('image/'));
