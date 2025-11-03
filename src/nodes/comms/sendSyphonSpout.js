/**
 * @name Send Syphon/Spout
 * @description Share frames with other applications via Syphon (macOS) or Spout (Windows).
 * @category comms
 */

const imageIn = node.imageIn('image');
const enableIn = node.toggleIn('enable', true);
const serverNameIn = node.stringIn('serverName', 'Figment');
const fpsIn = node.numberIn('fps', 30, { min: 1, max: 120 });

let _timer = null;
let _shouldSend = false;
let _lastFrameTime = 0;

node.onStart = () => {
  _shouldSend = false;
  _lastFrameTime = 0;

  if (enableIn.value) {
    const serverName = serverNameIn.value;
    window.desktop.startSyphonSpout(serverName);

    // Set up periodic frame sending
    _timer = setInterval(() => {
      _shouldSend = true;
    }, 1000 / fpsIn.value);
  }
};

node.onRender = () => {
  if (!enableIn.value || !imageIn.value || !_shouldSend) return;

  const framebuffer = imageIn.value;
  if (!framebuffer || !framebuffer._fbo) return;

  // Read pixels from the framebuffer
  const width = framebuffer.width;
  const height = framebuffer.height;
  const imageData = new Uint8Array(width * height * 4);

  framebuffer.bind();
  window.gl.readPixels(0, 0, width, height, window.gl.RGBA, window.gl.UNSIGNED_BYTE, imageData);
  framebuffer.unbind();

  // Send the frame data to the main process
  window.desktop.sendSyphonSpoutFrame(imageData, width, height);

  _shouldSend = false;
};

node.onStop = () => {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }

  window.desktop.stopSyphonSpout();
};

const restartServer = () => {
  window.desktop.stopSyphonSpout();
  window.desktop.startSyphonSpout(serverNameIn.value);
};

const updateTimer = () => {
  if (_timer) {
    clearInterval(_timer);
  }
  if (enableIn.value) {
    _timer = setInterval(() => {
      _shouldSend = true;
    }, 1000 / fpsIn.value);
  }
};

enableIn.onChange = () => {
  if (enableIn.value) {
    // Only start if not already running
    if (!_timer) {
      node.onStart();
    }
  } else {
    node.onStop();
  }
};

serverNameIn.onChange = () => {
  if (enableIn.value) {
    restartServer();
  }
};

fpsIn.onChange = updateTimer;
