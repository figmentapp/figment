/**
 * @name Load Movie
 * @description Load a movie file.
 * @category image
 */

node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'movie' });
const animateIn = node.toggleIn('animate', true);
const speedIn = node.numberIn('speed', 1, { min: 0.0, max: 10, step: 0.1 });
const restartIn = node.triggerButtonIn('restart');
const imageOut = node.imageOut('out');

let framebuffer, program, video, videoReady, shouldLoad;

node.onStart = () => {
  framebuffer = new figment.Framebuffer();
  videoReady = false;
  shouldLoad = true;
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
    video.loop = true;
    video.autoplay = animateIn.value;
    video.muted = true;
    video.playbackRate = speedIn.value;
    video.addEventListener('canplay', resolve, { once: true });
  });
  videoReady = true;
  framebuffer.setSize(video.videoWidth, video.videoHeight);
}

node.onRender = async () => {
  if (shouldLoad) {
    await loadMovie();
    shouldLoad = false;
  }
  if (!video || !framebuffer || !videoReady) return;
  if (!animateIn.value) return;
  framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  // To avoid re-uploading the video frame, we pass it along into the framebuffer object.
  // If the next node turns out to be a mediapose node, it will pick up the image object and work with it directly.
  framebuffer._directImageHack = video;
  imageOut.set(framebuffer);
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

function toggleAnimate() {
  if (video) {
    if (animateIn.value) {
      video.play();
    } else {
      video.pause();
    }
  }
}

function restartVideo() {
  if (video) {
    video.currentTime = 0;
  }
}
node.onReset = restartVideo;
fileIn.onChange = () => {
  shouldLoad = true;
};
speedIn.onChange = changeSpeed;
animateIn.onChange = toggleAnimate;
restartIn.onTrigger = restartVideo;
