// Worker for off-main-thread image encoding using OffscreenCanvas.
// Messages:
// - { id, rgbaBuffer, width, height, imageType, imageQuality }
// Replies:
// - { id, buffer } (encoded image as ArrayBuffer, transferred)
// - { id, error } (encoding failed)

self.onmessage = async (e) => {
  const { id, rgbaBuffer, width, height, imageType, imageQuality } = e.data;

  try {
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const imageData = new ImageData(rgba, width, height);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const mimeType = imageType || 'image/png';
    const options = mimeType === 'image/jpeg' ? { type: mimeType, quality: imageQuality } : { type: mimeType };
    const blob = await canvas.convertToBlob(options);
    const buffer = await blob.arrayBuffer();

    self.postMessage({ id, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
