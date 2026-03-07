/**
 * @name Load Image
 * @description Load an image from a file.
 * @category image
 */

const fileIn = node.fileIn('file', '', { fileType: 'image' });
const imageOut = node.imageOut('out');

let target;

node.onStart = () => {
  target = new figment.RenderTarget({ label: 'loadImage' });
};

node.onRender = async () => {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  try {
    const response = await fetch(imageUrl.toString());
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    target.setSize(bitmap.width, bitmap.height);
    target.uploadExternal(bitmap);
    bitmap.close();
    imageOut.set(target);
  } catch (err) {
    throw new Error(`Image load error: ${err}`);
  }
};

node.onStop = () => {
  target?.destroy();
};
