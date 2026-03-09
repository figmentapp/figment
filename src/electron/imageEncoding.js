const PROBE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgbABB5A359Y87XAAAAAElFTkSuQmCC';
const PROBE_RGBA = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]);
const CHANNEL_PERMUTATIONS = [
  ['r', 'g', 'b', 'a'],
  ['r', 'g', 'a', 'b'],
  ['r', 'b', 'g', 'a'],
  ['r', 'b', 'a', 'g'],
  ['r', 'a', 'g', 'b'],
  ['r', 'a', 'b', 'g'],
  ['g', 'r', 'b', 'a'],
  ['g', 'r', 'a', 'b'],
  ['g', 'b', 'r', 'a'],
  ['g', 'b', 'a', 'r'],
  ['g', 'a', 'r', 'b'],
  ['g', 'a', 'b', 'r'],
  ['b', 'r', 'g', 'a'],
  ['b', 'r', 'a', 'g'],
  ['b', 'g', 'r', 'a'],
  ['b', 'g', 'a', 'r'],
  ['b', 'a', 'r', 'g'],
  ['b', 'a', 'g', 'r'],
  ['a', 'r', 'g', 'b'],
  ['a', 'r', 'b', 'g'],
  ['a', 'g', 'r', 'b'],
  ['a', 'g', 'b', 'r'],
  ['a', 'b', 'r', 'g'],
  ['a', 'b', 'g', 'r'],
];

function premultiply(value, alpha) {
  return Math.round((value * alpha) / 255);
}

function mapChannel(channel, r, g, b, a, premultiplyAlpha) {
  switch (channel) {
    case 'r':
      return premultiplyAlpha ? premultiply(r, a) : r;
    case 'g':
      return premultiplyAlpha ? premultiply(g, a) : g;
    case 'b':
      return premultiplyAlpha ? premultiply(b, a) : b;
    case 'a':
      return a;
    default:
      return 0;
  }
}

export function clampJpegQuality(quality) {
  const numeric = Number.isFinite(quality) ? quality : 1;
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

export function convertRgbaToBitmapBuffer(rgbaBuffer, width, height, format, reusableBuffer = null) {
  const length = width * height * 4;
  const out = reusableBuffer && reusableBuffer.length === length ? reusableBuffer : Buffer.allocUnsafe(length);
  const source = rgbaBuffer instanceof Uint8Array ? rgbaBuffer : new Uint8Array(rgbaBuffer);

  for (let i = 0; i < length; i += 4) {
    const r = source[i];
    const g = source[i + 1];
    const b = source[i + 2];
    const a = source[i + 3];
    out[i] = mapChannel(format.order[0], r, g, b, a, format.premultiplyAlpha);
    out[i + 1] = mapChannel(format.order[1], r, g, b, a, format.premultiplyAlpha);
    out[i + 2] = mapChannel(format.order[2], r, g, b, a, format.premultiplyAlpha);
    out[i + 3] = mapChannel(format.order[3], r, g, b, a, format.premultiplyAlpha);
  }

  return out;
}

export function detectNativeBitmapFormat(nativeImageApi) {
  if (!nativeImageApi || typeof nativeImageApi.createFromDataURL !== 'function') {
    return null;
  }

  const probeImage = nativeImageApi.createFromDataURL(PROBE_DATA_URL);
  if (!probeImage || probeImage.isEmpty?.()) {
    return null;
  }

  const probeBitmap = probeImage.toBitmap();
  if (!probeBitmap || probeBitmap.length !== PROBE_RGBA.length) {
    return null;
  }

  for (const order of CHANNEL_PERMUTATIONS) {
    for (const premultiplyAlpha of [false, true]) {
      const candidate = convertRgbaToBitmapBuffer(PROBE_RGBA, 2, 1, { order, premultiplyAlpha });
      if (Buffer.compare(candidate, probeBitmap) === 0) {
        return { order, premultiplyAlpha };
      }
    }
  }

  return null;
}

export function createNativeImageEncoder({ nativeImage: nativeImageApi, writeFile }) {
  let bitmapFormat = null;
  let didProbe = false;
  let scratchBuffer = null;

  function ensureBitmapFormat() {
    if (didProbe) return bitmapFormat;
    bitmapFormat = detectNativeBitmapFormat(nativeImageApi);
    didProbe = true;
    return bitmapFormat;
  }

  function ensureScratchBuffer(length) {
    if (!scratchBuffer || scratchBuffer.length !== length) {
      scratchBuffer = Buffer.allocUnsafe(length);
    }
    return scratchBuffer;
  }

  return {
    getBitmapFormat() {
      return ensureBitmapFormat();
    },

    async encodeAndSaveImage({ rgbaBuffer, width, height, filePath, imageType, imageQuality }) {
      const format = ensureBitmapFormat();
      if (!format) return false;

      const length = width * height * 4;
      const bitmapBuffer = convertRgbaToBitmapBuffer(rgbaBuffer, width, height, format, ensureScratchBuffer(length));
      const image = nativeImageApi.createFromBitmap(bitmapBuffer, { width, height, scaleFactor: 1.0 });
      if (!image || image.isEmpty?.()) {
        return false;
      }

      let encodedBuffer;
      if (imageType === 'image/png') {
        encodedBuffer = image.toPNG();
      } else if (imageType === 'image/jpeg') {
        encodedBuffer = image.toJPEG(clampJpegQuality(imageQuality));
      } else {
        throw new Error(`Unsupported image type: ${imageType}`);
      }

      await writeFile(filePath, encodedBuffer);
      return true;
    },
  };
}
