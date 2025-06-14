/**
 * @name Save Image
 * @description Save the image to disk.
 * @category image
 */

const imageIn = node.imageIn('in');
const enableIn = node.selectIn('Enable', ['On Export', 'Always', 'Never'], 'On Export');
const folderIn = node.directoryIn('folder', '');
const templateIn = node.stringIn('template', 'image-#####.png');
const imageQualityIn = node.numberIn('quality', 0.9, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

node.onRender = async () => {
  if (!imageIn.value) return;
  imageOut.set(imageIn.value);

  if (enableIn.value === 'Never') return;
  const runtimeMode = window.desktop.getRuntimeMode();
  if (enableIn.value === 'On Export' && runtimeMode !== 'export') return;

  const folder = folderIn.value;
  if (!folder) return;
  const baseDir = figment.filePathForAsset(folder);
  const template = templateIn.value;
  const fileExt = template.split('.').pop().toLowerCase();
  let imageType;
  if (fileExt === 'png') {
    imageType = 'image/png';
  } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
    imageType = 'image/jpeg';
  } else {
    console.error('Unsupported file extension: ' + fileExt);
    return;
  }
  const imageQuality = imageQualityIn.value;
  await figment.ensureDirectory(baseDir);
  // Read out the pixels of the framebuffer.
  const framebuffer = imageIn.value;
  const imageData = new ImageData(framebuffer.width, framebuffer.height);
  framebuffer.bind();
  window.gl.readPixels(0, 0, framebuffer.width, framebuffer.height, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
  framebuffer.unbind();
  // Put the image data into an offscreen canvas.
  const canvas = new OffscreenCanvas(framebuffer.width, framebuffer.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  // Convert the canvas to a PNG blob, then to a buffer.
  const blob = await canvas.convertToBlob({ type: imageType, quality: imageQuality });
  const pngBuffer = await blob.arrayBuffer();
  // Write the buffer to the given file path.
  const currentFrame = window.desktop.getCurrentFrame();
  const digits = template.split('#').length - 1;
  const filePath = baseDir + '/' + template.replace(/#{1,10}/, currentFrame.toString().padStart(digits, '0'));
  await window.desktop.saveBufferToFile(pngBuffer, filePath);
};
