/**
 * @name Load Movie
 * @description Load a movie file.
 * @category image
 */

node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'movie' });
const playIn = node.toggleIn('play', true);
playIn.display = 0x03;
const loopIn = node.toggleIn('loop', true);
const pauseModeIn = node.selectIn('pauseMode', ['hold', 'restart', 'rewind'], 'hold');
const speedIn = node.numberIn('speed', 1, { min: 0.0, max: 10, step: 0.1 });
const restartIn = node.triggerButtonIn('restart');
const frameIn = node.numberIn('frame', 1, { min: 1, step: 1 });
frameIn.display = 0x03;

const imageOut = node.imageOut('out');
const frameCountOut = node.numberOut('frameCount');
const currentFrameOut = node.numberOut('currentFrame');
const fpsOut = node.numberOut('fps');
const durationOut = node.numberOut('duration');

// Video resources
let framebuffer, input, videoTrack, canvasSink;
let frameCount = 0;
let detectedFps = 0;
let duration = 0;
let shouldLoad = true;
let lastRenderedTimestamp = null;
let firstTimestamp = 0;

// Playback state machine
const STATE_STOPPED = 'stopped';
const STATE_PLAYING = 'playing';
const STATE_PAUSED = 'paused';

let playbackState = STATE_STOPPED;
let playbackStartFrame = 0;
let playbackStartTime = 0;
let currentFrame = 0;
let lastRenderedFrame = -1;
let canvasIterator = null;
let queuedSequentialCanvas = null;
let frameFlowState = 'idle';
let renderPending = false;

const FRAMEFLOW_IDLE = 'idle';
const FRAMEFLOW_SEEKING = 'seeking';
const FRAMEFLOW_ITERATING = 'iterating';
const TIMESTAMP_EPSILON = 1e-6;

function disposeQueuedSequentialCanvas() {
  if (queuedSequentialCanvas) {
    disposeWrappedCanvas(queuedSequentialCanvas);
    queuedSequentialCanvas = null;
  }
}

function clearCanvasIterator() {
  if (canvasIterator && typeof canvasIterator.return === 'function') {
    canvasIterator.return().catch(() => {});
  }
  canvasIterator = null;
  disposeQueuedSequentialCanvas();
  frameFlowState = FRAMEFLOW_IDLE;
}

node.onStart = () => {
  framebuffer = new figment.Framebuffer();
  shouldLoad = true;
  playbackState = STATE_STOPPED;
  playbackStartFrame = 0;
  playbackStartTime = 0;
  currentFrame = 0;
  lastRenderedFrame = -1;
  clearCanvasIterator();
  renderPending = false;
  lastRenderedTimestamp = null;
  firstTimestamp = 0;
  frameFlowState = FRAMEFLOW_IDLE;
};

async function loadMovie() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;

  // Dispose previous resources
  if (input) {
    input.dispose();
    input = null;
  }
  videoTrack = null;
  canvasSink = null;
  clearCanvasIterator();

  try {
    const { Input, BlobSource, CanvasSink, MP4, QTFF, WEBM, MATROSKA } = window.mediabunny;

    // Load video file
    const fileUrl = figment.urlForAsset(fileIn.value);
    const response = await fetch(fileUrl);
    const blob = await response.blob();

    input = new Input({
      source: new BlobSource(blob),
      formats: [MP4, QTFF, WEBM, MATROSKA],
    });

    videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('No video track found in file');
    }

    // Get video metadata
    const stats = await videoTrack.computePacketStats();
    frameCount = stats.packetCount;
    detectedFps = stats.averagePacketRate;
    duration = await videoTrack.computeDuration();
    firstTimestamp = Math.max(0, videoTrack.getFirstTimestamp());

    canvasSink = new CanvasSink(videoTrack, {
      alpha: false,
      poolSize: 5,
    });

    framebuffer.setSize(videoTrack.displayWidth, videoTrack.displayHeight);

    // Output metadata
    frameCountOut.set(frameCount);
    fpsOut.set(detectedFps);
    durationOut.set(duration);

    // Reset state
    playbackState = STATE_STOPPED;
    playbackStartFrame = 0;
    playbackStartTime = 0;
    currentFrame = 0;
    lastRenderedFrame = -1;
    lastRenderedTimestamp = null;
    frameFlowState = FRAMEFLOW_IDLE;
    disposeQueuedSequentialCanvas();
  } catch (err) {
    console.error('Error loading movie:', err);
    node.error = err.message;
  }
}

function calculateTargetFrame() {
  if (!videoTrack) return 0;

  const runtimeMode = window.desktop.getRuntimeMode();
  const safeFps = detectedFps > 0 ? detectedFps : 1;

  if (runtimeMode === 'export') {
    // Export mode: direct frame mapping based on FPS ratio
    const effectiveSpeed = Number.isFinite(speedIn.value) ? Math.max(speedIn.value, 0) : 1;
    const exportFrameIndex = Math.max(0, window.desktop.getCurrentFrame() - 1);
    const exportFps = window.desktop.getExportFps() || safeFps;
    const videoFrame = Math.floor((exportFrameIndex / exportFps) * safeFps * effectiveSpeed);
    return Math.min(videoFrame, frameCount - 1);
  }

  // Live mode: calculate based on state
  if (playbackState === STATE_PLAYING) {
    const now = performance.now();
    if (playbackStartTime === 0) {
      playbackStartTime = now;
    }
    const elapsed = (now - playbackStartTime) / 1000;
    const framesElapsed = Math.floor(elapsed * safeFps * speedIn.value);
    let videoFrame = playbackStartFrame + framesElapsed;

    if (loopIn.value) {
      videoFrame = videoFrame % frameCount;
    } else {
      videoFrame = Math.min(videoFrame, frameCount - 1);
    }

    return videoFrame;
  }

  // Paused or stopped
  return currentFrame;
}

function disposeWrappedCanvas(wrappedCanvas) {
  if (!wrappedCanvas) return;
  const frame = wrappedCanvas.frame ?? wrappedCanvas.videoFrame ?? wrappedCanvas.sample;
  if (frame && typeof frame.close === 'function') frame.close();
  if (wrappedCanvas.close && typeof wrappedCanvas.close === 'function') wrappedCanvas.close();
}

function uploadFrameToTexture(wrappedCanvas, videoFrame) {
  if (!wrappedCanvas || !framebuffer) return;

  try {
    // Copy canvas to WebGL texture
    framebuffer.unbind();
    window.gl.bindTexture(window.gl.TEXTURE_2D, framebuffer.texture);
    window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, wrappedCanvas.canvas);
    window.gl.bindTexture(window.gl.TEXTURE_2D, null);

    imageOut.set(framebuffer);
    currentFrameOut.set(videoFrame + 1);
    lastRenderedFrame = videoFrame;
    lastRenderedTimestamp = wrappedCanvas.timestamp ?? lastRenderedTimestamp;
  } finally {
    // Close VideoFrame to prevent memory leaks
    disposeWrappedCanvas(wrappedCanvas);
  }
}

async function pullNextSequentialCanvas() {
  if (!canvasIterator) return null;

  frameFlowState = FRAMEFLOW_ITERATING;

  while (true) {
    const result = await canvasIterator.next();
    if (result.done) {
      clearCanvasIterator();
      return null;
    }

    const nextCanvas = result.value;
    if (!nextCanvas) continue;

    const nextTimestamp = typeof nextCanvas.timestamp === 'number' ? nextCanvas.timestamp : null;
    if (nextTimestamp !== null && lastRenderedTimestamp !== null && nextTimestamp <= lastRenderedTimestamp + TIMESTAMP_EPSILON) {
      disposeWrappedCanvas(nextCanvas);
      continue;
    }

    return nextCanvas;
  }
}

async function consumeSequentialCanvas() {
  if (queuedSequentialCanvas) {
    const readyCanvas = queuedSequentialCanvas;
    queuedSequentialCanvas = null;
    return readyCanvas;
  }

  return await pullNextSequentialCanvas();
}

function computeTimestampForFrame(targetFrame, safeFps) {
  const base = Number.isFinite(firstTimestamp) ? firstTimestamp : 0;
  const unclamped = base + targetFrame / safeFps;
  if (duration > 0) {
    const capped = Math.max(base, duration - TIMESTAMP_EPSILON);
    return Math.min(unclamped, capped);
  }
  return unclamped;
}

async function primeSequentialIteratorFrom(wrappedCanvas, safeFps) {
  if (!canvasSink) {
    clearCanvasIterator();
    return;
  }

  const anchorTimestamp = typeof wrappedCanvas.timestamp === 'number' ? wrappedCanvas.timestamp : null;
  if (anchorTimestamp === null) {
    clearCanvasIterator();
    return;
  }

  const canvasDuration = wrappedCanvas.duration && wrappedCanvas.duration > 0 ? wrappedCanvas.duration : 1 / safeFps;
  const step = Math.max(canvasDuration * 0.75, TIMESTAMP_EPSILON);
  const nextStart = Math.min(duration, anchorTimestamp + step);

  clearCanvasIterator();
  canvasIterator = canvasSink.canvases(nextStart, duration);
  frameFlowState = FRAMEFLOW_ITERATING;
  queuedSequentialCanvas = await pullNextSequentialCanvas();
}

async function renderFrame(targetFrame) {
  if (!canvasSink || !videoTrack || targetFrame < 0 || targetFrame >= frameCount) {
    return false;
  }

  // Skip if already rendered
  if (targetFrame === lastRenderedFrame) {
    return true;
  }

  const safeFps = detectedFps > 0 ? detectedFps : 1;

  try {
    if (targetFrame === lastRenderedFrame + 1) {
      if (frameFlowState === FRAMEFLOW_ITERATING || queuedSequentialCanvas) {
        const sequentialCanvas = await consumeSequentialCanvas();
        if (sequentialCanvas) {
          uploadFrameToTexture(sequentialCanvas, targetFrame);
          if (canvasIterator) {
            queuedSequentialCanvas = await pullNextSequentialCanvas();
          }
          return true;
        }
        clearCanvasIterator();
        frameFlowState = FRAMEFLOW_SEEKING;
      } else {
        clearCanvasIterator();
        frameFlowState = FRAMEFLOW_SEEKING;
      }
    } else {
      clearCanvasIterator();
      frameFlowState = FRAMEFLOW_SEEKING;
    }

    const timestamp = computeTimestampForFrame(targetFrame, safeFps);
    const wrappedCanvas = await canvasSink.getCanvas(timestamp);

    if (wrappedCanvas) {
      uploadFrameToTexture(wrappedCanvas, targetFrame);
      await primeSequentialIteratorFrom(wrappedCanvas, safeFps);
      return true;
    }

    return false;
  } catch (err) {
    console.error('Error rendering video frame:', err);
    node.error = err.message;
    clearCanvasIterator();
    lastRenderedTimestamp = null;
    frameFlowState = FRAMEFLOW_IDLE;
    return false;
  }
}

function resetPlaybackState() {
  playbackState = STATE_STOPPED;
  playbackStartFrame = 0;
  playbackStartTime = 0;
  currentFrame = 0;
  lastRenderedFrame = -1;
  clearCanvasIterator();
  lastRenderedTimestamp = null;
  frameFlowState = FRAMEFLOW_IDLE;
  node._markDirty();
}

async function ensureFramePrimed() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;

  while (renderPending) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  try {
    if (shouldLoad || !canvasSink || !videoTrack) {
      await loadMovie();
      if (!canvasSink || !videoTrack) return;
      shouldLoad = false;
    }

    if (!framebuffer || frameCount <= 0) return;

    renderPending = true;
    const success = await renderFrame(0);
    if (success) {
      currentFrame = 0;
    }
  } catch (err) {
    console.error('Error priming video frame:', err);
    node.error = err.message;
  } finally {
    renderPending = false;
  }
}

async function resetPlayback() {
  resetPlaybackState();
  await ensureFramePrimed();
}

node.onRender = async () => {
  // Prevent concurrent renders
  if (renderPending) return;
  renderPending = true;

  try {
    // Load video if needed
    if (shouldLoad) {
      await loadMovie();
      shouldLoad = false;
    }

    if (!videoTrack || !canvasSink || !framebuffer) return;

    // Update playback state based on inputs
    const wasPlaying = playbackState === STATE_PLAYING;
    const shouldPlay = playIn.value;

    if (shouldPlay && !wasPlaying) {
      // Transition to playing
      if (pauseModeIn.value === 'restart') {
        playbackStartFrame = 0;
        currentFrame = 0;
      } else {
        playbackStartFrame = currentFrame;
      }
      playbackStartTime = 0;
      playbackState = STATE_PLAYING;
    } else if (!shouldPlay && wasPlaying) {
      // Transition to paused
      currentFrame = calculateTargetFrame();
      if (pauseModeIn.value === 'rewind') {
        currentFrame = 0;
      }
      playbackState = STATE_PAUSED;
    }

    // Handle manual frame input (1-based incoming value)
    if (!shouldPlay) {
      const requested = Number.isFinite(frameIn.value) ? Math.round(frameIn.value) : 1;
      const atLeastOne = Math.max(1, requested);
      const clampedOneBased = frameCount > 0 ? Math.min(atLeastOne, frameCount) : atLeastOne;
      const desiredFrame = clampedOneBased - 1;
      if (desiredFrame !== currentFrame) {
        currentFrame = desiredFrame;
        clearCanvasIterator();
      }
    }

    // Calculate target frame
    const targetFrame = calculateTargetFrame();

    // Handle end of video
    if (!loopIn.value && targetFrame >= frameCount - 1 && playbackState === STATE_PLAYING) {
      playbackState = STATE_PAUSED;
      playIn.value = false;
      if (pauseModeIn.value === 'rewind') {
        currentFrame = 0;
      }
    }

    // Render the frame
    // We await here to ensure the frame has loaded (can take a while when seeking)
    await renderFrame(targetFrame);
    currentFrame = targetFrame;
  } finally {
    renderPending = false;
  }
};

node.onStop = () => {
  if (input) {
    input.dispose();
    input = null;
  }
  videoTrack = null;
  canvasSink = null;
  clearCanvasIterator();
  lastRenderedFrame = -1;
  renderPending = false;
  lastRenderedTimestamp = null;
  frameFlowState = FRAMEFLOW_IDLE;
};

node.onReset = resetPlayback;

fileIn.onChange = () => {
  shouldLoad = true;
  clearCanvasIterator();
  lastRenderedFrame = -1;
  lastRenderedTimestamp = null;
  frameFlowState = FRAMEFLOW_IDLE;
};

speedIn.onChange = () => {
  if (playbackState === STATE_PLAYING && playbackStartTime > 0) {
    // Adjust timing to maintain smooth playback at new speed
    playbackStartFrame = currentFrame;
    playbackStartTime = 0;
  }
};

restartIn.onTrigger = resetPlayback;
