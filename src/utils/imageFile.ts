/** longest side of an image kept in a model (px) – larger pictures are scaled down, the file stays small */
const IMAGE_LIMIT = 2048;

export interface ModelImage {
  /** data URL (PNG or JPEG) */
  url: string;
  /** height / width */
  aspect: number;
}

const readDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Reads a picture file for a material. PNG and JPEG up to the size limit stay as they are; anything else is drawn
 * again – as PNG when it may be see-through (PNG, WebP, GIF), else as JPEG.
 */
export const readImageFile = async (file: File): Promise<ModelImage> => {
  const original = await readDataUrl(file);
  const image = new Image();
  image.src = original;
  await image.decode();
  const width = image.naturalWidth,
    height = image.naturalHeight;
  if (!width || !height) {
    throw new Error('empty image');
  }
  const aspect = height / width;
  const scale = Math.min(1, IMAGE_LIMIT / Math.max(width, height));
  if (scale === 1 && /^data:image\/(png|jpeg);/.test(original)) {
    return { url: original, aspect };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const keepAlpha = /^image\/(png|webp|gif)$/.test(file.type);
  return { url: canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.9), aspect };
};
