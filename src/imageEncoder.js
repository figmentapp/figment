// Off-main-thread image encoder using a Web Worker + OffscreenCanvas.
// The worker handles RGBA → PNG/JPEG encoding on a separate thread,
// then the result is written to disk via the preload's saveBufferToFile.

let _worker = null;
let _nextId = 0;
const _pending = new Map();

function ensureWorker() {
  if (_worker) return _worker;
  _worker = new Worker(new URL('./workers/imageEncoderWorker.js', import.meta.url), { type: 'module' });
  _worker.onmessage = (e) => {
    const { id, buffer, error } = e.data;
    const entry = _pending.get(id);
    if (!entry) return;
    _pending.delete(id);
    if (error) {
      entry.reject(new Error(error));
    } else {
      entry.resolve(buffer);
    }
  };
  return _worker;
}

export function createImageEncoder() {
  return {
    async encodeAndSave({ rgbaBuffer, width, height, filePath, imageType, imageQuality }) {
      ensureWorker();
      const id = _nextId++;

      // Transfer the buffer to the worker (zero-copy).
      // The caller always passes a standalone Uint8Array copy, so
      // rgbaBuffer.buffer is the entire ArrayBuffer we can transfer directly.
      const buffer = rgbaBuffer.buffer;
      const encodedBuffer = await new Promise((resolve, reject) => {
        _pending.set(id, { resolve, reject });
        _worker.postMessage({ id, rgbaBuffer: buffer, width, height, imageType, imageQuality }, [buffer]);
      });

      await window.desktop.saveBufferToFile(new Uint8Array(encodedBuffer), filePath);
      return true;
    },

    terminate() {
      if (_worker) {
        _worker.terminate();
        _worker = null;
      }
      for (const [, { reject }] of _pending) {
        reject(new Error('encoder terminated'));
      }
      _pending.clear();
    },
  };
}
