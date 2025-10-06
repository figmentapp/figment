/**
 * @name Load Movie
 * @description Load a movie file.
 * @category image
 */

node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'movie' });
const playIn = node.toggleIn('play', true);
// The play input is both a plug and a parameter.
playIn.display = 0x03;
const loopIn = node.toggleIn('loop', true);
const pauseModeIn = node.selectIn('pauseMode', ['hold', 'restart', 'rewind'], 'hold');
const speedIn = node.numberIn('speed', 1, { min: 0.0, max: 10, step: 0.1 });
const fpsIn = node.numberIn('fps', 30, { min: 1, max: 240, step: 1 });
const restartIn = node.triggerButtonIn('restart');
const frameIn = node.numberIn('frame', 0, { min: 0, step: 1 });
frameIn.display = 0x03;
const imageOut = node.imageOut('out');
const frameCountOut = node.numberOut('frameCount');
const currentFrameOut = node.numberOut('currentFrame');

let framebuffer, program, video, videoReady, shouldLoad, lastPlayState, renderOnce;
let frameCount = 0;
let lastFrameTarget = -1;

node.onStart = () => {
  framebuffer = new figment.Framebuffer();
  videoReady = false;
  shouldLoad = true;
  lastPlayState = playIn.value;
  renderOnce = true;
};

async function loadMovie() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  if (video) {
    video.remove();
  }
  await new Promise((resolve) => {
    video = document.createElement('video');
    videoReady = false;
    const fileUrl = figment.urlForAsset(fileIn.value);
    video.src = fileUrl;
    video.loop = loopIn.value;
    video.autoplay = playIn.value;
    video.muted = true;
    video.playbackRate = speedIn.value;
    video.addEventListener('canplay', resolve, { once: true });
    video.addEventListener('ended', () => {
      if (!loopIn.value && pauseModeIn.value === 'rewind') {
        restartVideo();
      }
    });
  });
  videoReady = true;
  frameCount = Math.floor(video.duration * fpsIn.value);
  frameCountOut.set(frameCount);
  framebuffer.setSize(video.videoWidth, video.videoHeight);
}

async function seekAndWait(time) {
  return new Promise((resolve) => {
    if (!video || video.currentTime === time) {
      return resolve();
    }
    video.addEventListener('seeked', resolve, { once: true });
    video.currentTime = time;
  });
}

async function seekFrame(frameIndex) {
  if (!video || frameIndex < 0) return;
  const time = frameIndex / fpsIn.value;
  await seekAndWait(time);
  renderOnce = true;
  if (playIn.value) {
    video.play();
  }
  node._markDirty();
}

node.onRender = async () => {
  if (shouldLoad) {
    await loadMovie();
    shouldLoad = false;
  }
  if (!video || !framebuffer || !videoReady) return;
  const isPlaying = playIn.value;
  const wasPlaying = lastPlayState;

  if (isPlaying && !wasPlaying) {
    if (pauseModeIn.value === 'restart') {
      await seekAndWait(0);
    }
    video.play();
  } else if (!isPlaying && wasPlaying) {
    video.pause();
    if (pauseModeIn.value === 'rewind') {
      await seekAndWait(0);
      renderOnce = true;
    }
  }
  lastPlayState = isPlaying;

  if (frameIn.value !== lastFrameTarget) {
    lastFrameTarget = frameIn.value;
    await seekFrame(lastFrameTarget);
  }

  if (video.paused && !renderOnce) return;

  framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  framebuffer._directImageHack = video;
  imageOut.set(framebuffer);

  const currentFrame = Math.floor(video.currentTime * fpsIn.value);
  currentFrameOut.set(currentFrame);

  if (video.paused) {
    renderOnce = false;
  }
};

node.onStop = () => {
  if (video) {
    video.pause();
    video.remove();
    video = null;
  }
};

function changeSpeed() {
  if (video) {
    video.playbackRate = speedIn.value;
  }
}

function changeLoop() {
  if (video) {
    // The `video.ended` boolean is not reliable, so we check ourselves.
    const isAtEnd = video.duration > 0 && video.duration - video.currentTime < 0.1;
    video.loop = loopIn.value;
    if (loopIn.value && isAtEnd && playIn.value) {
      video.play();
    }
  }
}

async function restartVideo() {
  if (video) {
    await seekAndWait(0);
    renderOnce = true;
    node._markDirty();
  }
}
node.onReset = restartVideo;

fileIn.onChange = () => {
  shouldLoad = true;
};
speedIn.onChange = changeSpeed;
loopIn.onChange = changeLoop;
restartIn.onTrigger = restartVideo;
fpsIn.onChange = () => {
  if (video) {
    frameCount = Math.floor(video.duration * fpsIn.value);
    frameCountOut.set(frameCount);
  }
};
