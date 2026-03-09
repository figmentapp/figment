import { afterEach, describe, expect, test, vi } from 'vitest';

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.messages = [];
    this.terminated = false;
    this.onmessage = null;
    FakeWorker.instances.push(this);
  }

  postMessage(message, transfer = []) {
    this.messages.push({ message, transfer });
    if (message.type === 'init') {
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: 'ready', task: message.task } });
      });
    }
  }

  dispatch(data) {
    this.onmessage?.({ data });
  }

  terminate() {
    this.terminated = true;
  }
}

async function loadMediaPipeWorkerClient() {
  vi.resetModules();
  FakeWorker.instances.length = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('window', {});
  vi.stubGlobal('AudioContext', class AudioContext {});
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  });
  const module = await import('./figment');
  return module.MediaPipeWorkerClient;
}

describe('MediaPipeWorkerClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('posts raw RGBA frames and recycles returned buffers', async () => {
    const MediaPipeWorkerClient = await loadMediaPipeWorkerClient();
    const client = new MediaPipeWorkerClient('pose', {
      taskFile: 'pose_landmarker_lite.task',
      taskOptions: { runningMode: 'IMAGE' },
    });
    await client.ready();

    const worker = FakeWorker.instances[0];
    expect(worker.messages[0].message.type).toBe('init');

    const frame = client.borrowFrame(2, 2);
    const frameBuffer = frame.buffer;
    frame[0] = 255;

    const inferPromise = client.inferRgba(frame, 2, 2);
    await Promise.resolve();
    const frameMessage = worker.messages[1];
    expect(frameMessage.message.type).toBe('frame');
    expect(frameMessage.message.buffer).toBe(frameBuffer);
    expect(frameMessage.transfer).toEqual([frameBuffer]);

    worker.dispatch({
      type: 'result',
      id: 1,
      result: { ok: true, landmarks: [] },
      buffer: frameBuffer,
    });

    await expect(inferPromise).resolves.toEqual({ ok: true, landmarks: [] });

    const recycled = client.borrowFrame(2, 2);
    expect(recycled.buffer).toBe(frameBuffer);

    const resized = client.borrowFrame(3, 2);
    expect(resized.buffer).not.toBe(frameBuffer);

    client.terminate();
    expect(worker.terminated).toBe(true);
  });
});
