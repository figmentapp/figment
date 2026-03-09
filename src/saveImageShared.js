export function parseSaveImageTemplate(template) {
  const fileExt = template.split('.').pop().toLowerCase();
  let imageType;

  if (fileExt === 'png') {
    imageType = 'image/png';
  } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
    imageType = 'image/jpeg';
  } else {
    throw new Error(`Unsupported file extension: ${fileExt}`);
  }

  return {
    imageType,
    digits: template.split('#').length - 1,
    template,
  };
}

export function buildSaveImagePath(baseDir, template, currentFrame, digits) {
  return `${baseDir}/${template.replace(/#{1,10}/, currentFrame.toString().padStart(digits, '0'))}`;
}

export function ensureFallbackCanvas(state, width, height, createCanvas = (w, h) => new OffscreenCanvas(w, h)) {
  if (!state.fallbackCanvas) {
    state.fallbackCanvas = createCanvas(width, height);
    state.fallbackCtx = state.fallbackCanvas.getContext('2d');
    state.fallbackWidth = width;
    state.fallbackHeight = height;
    return { canvas: state.fallbackCanvas, ctx: state.fallbackCtx };
  }

  if (state.fallbackWidth !== width || state.fallbackHeight !== height) {
    state.fallbackCanvas.width = width;
    state.fallbackCanvas.height = height;
    state.fallbackWidth = width;
    state.fallbackHeight = height;
  }

  if (!state.fallbackCtx) {
    state.fallbackCtx = state.fallbackCanvas.getContext('2d');
  }

  return { canvas: state.fallbackCanvas, ctx: state.fallbackCtx };
}

export async function encodeWithCanvasFallback({
  state,
  rgba,
  width,
  height,
  filePath,
  imageType,
  imageQuality,
  saveBufferToFile,
  createCanvas,
}) {
  const { canvas, ctx } = ensureFallbackCanvas(state, width, height, createCanvas);
  const pixels = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const imageData = new ImageData(pixels, width, height);
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: imageType, quality: imageQuality });
  const encodedBuffer = await blob.arrayBuffer();
  await saveBufferToFile(encodedBuffer, filePath);
}
