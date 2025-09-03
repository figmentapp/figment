/**
 * @name Load Image
 * @description Load an image from a file.
 * @category image
 */

const fileIn = node.fileIn('file', '', { fileType: 'image' });
const imageOut = node.imageOut('out');

let target; // figment.RenderTarget
let _img; // HTMLImageElement
let _bitmap; // ImageBitmap
let _shouldLoad;

node.onStart = () => {
  target = new figment.RenderTarget();
  _shouldLoad = true;
};

async function loadImage() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  try {
    // Clean up previous resources
    try {
      _bitmap?.close?.();
    } catch (e) {}
    _bitmap = null;
    _img = new Image();
    _img.crossOrigin = 'anonymous';
    _img.src = imageUrl;
    await _img.decode();
    _bitmap = await createImageBitmap(_img, { colorSpaceConversion: 'none' });

    // Upload to WebGPU texture owned by our RenderTarget
    target.uploadExternal(_bitmap);
    target._directImageHack = _img; // compatibility for preview/ML nodes
    imageOut.set(target);
  } catch (err) {
    throw new Error(`Image load error: ${err}`);
  }
}

node.onRender = async () => {
  if (_shouldLoad) {
    await loadImage();
    _shouldLoad = false;
  }
};

node.onStop = () => {
  try {
    _bitmap?.close?.();
  } catch (e) {}
  _bitmap = null;
  _img = null;
};

fileIn.onChange = () => {
  _shouldLoad = true;
};
