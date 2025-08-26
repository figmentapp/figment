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
const restartIn = node.triggerButtonIn('restart');
const imageOut = node.imageOut('out');

let target; // figment.RenderTarget
let video; // HTMLVideoElement
let videoReady, shouldLoad, lastPlayState, renderOnce;

node.onStart = () => {
  target = new figment.RenderTarget();
  videoReady = false;
  shouldLoad = true;
  lastPlayState = playIn.value;
  renderOnce = true;
};

async function loadMovie() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  if (video) {
    try {
      video.pause();
    } catch (e) {}
    video.remove();
  }
  await new Promise((resolve) => {
    video = document.createElement('video');
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.muted = true; // avoid autoplay restrictions
    videoReady = false;
    const fileUrl = figment.urlForAsset(fileIn.value);
    video.src = fileUrl;
    video.loop = loopIn.value;
    video.autoplay = playIn.value;
    video.playbackRate = speedIn.value;
    video.addEventListener('canplay', resolve, { once: true });
    video.addEventListener('ended', () => {
      if (!loopIn.value && pauseModeIn.value === 'rewind') {
        restartVideo();
      }
    });
  });
  videoReady = true;
  target.setSize(video.videoWidth, video.videoHeight);
}

async function seekAndWait(time) {
  return new Promise((resolve) => {
    if (!video || video.currentTime === time) return resolve();
    video.addEventListener('seeked', resolve, { once: true });
    video.currentTime = time;
  });
}

node.onRender = async () => {
  if (shouldLoad) {
    await loadMovie();
    shouldLoad = false;
  }
  if (!video || !target || !videoReady) return;

  const isPlaying = playIn.value;
  const wasPlaying = lastPlayState;

  if (isPlaying && !wasPlaying) {
    if (pauseModeIn.value === 'restart') {
      await seekAndWait(0);
    }
    try {
      await video.play();
    } catch (e) {}
  } else if (!isPlaying && wasPlaying) {
    video.pause();
    if (pauseModeIn.value === 'rewind') {
      await seekAndWait(0);
      renderOnce = true;
    }
  }
  lastPlayState = isPlaying;

  if (video.paused && !renderOnce) return;

  // Upload current video frame into the GPU texture
  target.uploadExternal(video);
  target._directImageHack = video; // compatibility for preview/ML nodes
  imageOut.set(target);

  if (video.paused) {
    renderOnce = false;
  }
};

node.onStop = () => {
  if (video) {
    try {
      video.pause();
    } catch (e) {}
    video.remove();
    video = null;
  }
};

function changeSpeed() {
  if (video) video.playbackRate = speedIn.value;
}

function changeLoop() {
  if (!video) return;
  const isAtEnd = video.duration > 0 && video.duration - video.currentTime < 0.1;
  video.loop = loopIn.value;
  if (loopIn.value && isAtEnd && playIn.value) {
    try {
      video.play();
    } catch (e) {}
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
