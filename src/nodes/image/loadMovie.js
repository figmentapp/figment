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
const frameIn = node.numberIn('frame', 0, { min: 0, step: 1 });
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
let renderPending = false;

node.onStart = () => {
  framebuffer = new figment.Framebuffer();
  shouldLoad = true;
  playbackState = STATE_STOPPED;
  playbackStartFrame = 0;
  playbackStartTime = 0;
  currentFrame = 0;
  lastRenderedFrame = -1;
  canvasIterator = null;
  renderPending = false;
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
  canvasIterator = null;

  try {
    const { Input, BlobSource, CanvasSink, MP4, WEBM, MATROSKA } = window.mediabunny;

    // Load video file
    const fileUrl = figment.urlForAsset(fileIn.value);
    const response = await fetch(fileUrl);
    const blob = await response.blob();

    input = new Input({
      source: new BlobSource(blob),
      formats: [MP4, WEBM, MATROSKA],
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
  } catch (err) {
    console.error('Error loading movie:', err);
    node.error = err.message;
  }
}

function calculateTargetFrame() {
  if (!videoTrack) return 0;

  const runtimeMode = window.desktop.getRuntimeMode();

  if (runtimeMode === 'export') {
    // Export mode: direct frame mapping based on FPS ratio
    const exportFrame = window.desktop.getCurrentFrame();
    const exportFps = window.desktop.getExportFps();
    const videoFrame = Math.floor((exportFrame / exportFps) * detectedFps);
    return Math.min(videoFrame, frameCount - 1);
  }

  // Live mode: calculate based on state
  if (playbackState === STATE_PLAYING) {
    const now = performance.now();
    if (playbackStartTime === 0) {
      playbackStartTime = now;
    }
    const elapsed = (now - playbackStartTime) / 1000;
    const framesElapsed = Math.floor(elapsed * detectedFps * speedIn.value);
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

function uploadFrameToTexture(wrappedCanvas, videoFrame) {
  if (!wrappedCanvas || !framebuffer) return;

  try {
    // Copy canvas to WebGL texture
    framebuffer.unbind();
    window.gl.bindTexture(window.gl.TEXTURE_2D, framebuffer.texture);
    window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, wrappedCanvas.canvas);
    window.gl.bindTexture(window.gl.TEXTURE_2D, null);

    imageOut.set(framebuffer);
    currentFrameOut.set(videoFrame);
    lastRenderedFrame = videoFrame;
  } finally {
    // Close VideoFrame to prevent memory leaks
    if (wrappedCanvas.frame && typeof wrappedCanvas.frame.close === 'function') {
      wrappedCanvas.frame.close();
    }
    if (wrappedCanvas.close && typeof wrappedCanvas.close === 'function') {
      wrappedCanvas.close();
    }
  }
}

async function renderFrame(targetFrame) {
  if (!canvasSink || !videoTrack || targetFrame < 0 || targetFrame >= frameCount) {
    return false;
  }

  // Skip if already rendered
  if (targetFrame === lastRenderedFrame) {
    return true;
  }

  try {
    const isSequential = targetFrame === lastRenderedFrame + 1;

    if (isSequential && canvasIterator) {
      // Sequential access: use iterator for performance
      const result = await canvasIterator.next();
      if (!result.done) {
        uploadFrameToTexture(result.value, targetFrame);
        return true;
      }
    }

    // Random access or iterator failed: seek directly
    canvasIterator = null;
    const timestamp = targetFrame / detectedFps;
    const wrappedCanvas = await canvasSink.getCanvas(timestamp);

    if (wrappedCanvas) {
      uploadFrameToTexture(wrappedCanvas, targetFrame);

      // Start new iterator for future sequential access
      const nextTimestamp = (targetFrame + 1) / detectedFps;
      if (nextTimestamp < duration) {
        canvasIterator = canvasSink.canvases(nextTimestamp, duration);
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error('Error rendering video frame:', err);
    node.error = err.message;
    canvasIterator = null;
    return false;
  }
}

function resetPlayback() {
  playbackState = STATE_STOPPED;
  playbackStartFrame = 0;
  playbackStartTime = 0;
  currentFrame = 0;
  lastRenderedFrame = -1;
  canvasIterator = null;
  node._markDirty();
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

    // Handle manual frame input
    if (frameIn.value !== currentFrame && !shouldPlay) {
      currentFrame = Math.min(Math.max(0, frameIn.value), frameCount - 1);
      canvasIterator = null;
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

    // Render the frame (CRITICAL: await this!)
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
  canvasIterator = null;
  lastRenderedFrame = -1;
  renderPending = false;
};

node.onReset = resetPlayback;

fileIn.onChange = () => {
  shouldLoad = true;
  canvasIterator = null;
  lastRenderedFrame = -1;
};

speedIn.onChange = () => {
  if (playbackState === STATE_PLAYING && playbackStartTime > 0) {
    // Adjust timing to maintain smooth playback at new speed
    playbackStartFrame = currentFrame;
    playbackStartTime = 0;
  }
};

restartIn.onTrigger = resetPlayback;
