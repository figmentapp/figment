/**
 * @name Webcam Image
 * @description Return a webcam or virtual cam stream
 * @category image
 */

node.timeDependent = true;
const frameRate = node.numberIn('frameRate', 30);
const operationIn = node.selectIn('camera', [], '0');
const imageOut = node.imageOut('image');

let _video,
  _stream,
  _timer,
  _framebuffer,
  shouldLoad,
  videoDevices,
  deviceMap = {};

node.onStart = async () => {
  shouldLoad = false;
  try {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
    operationIn.options = videoDevices.map((device, index) => {
      const label = device.label;
      deviceMap[label] = device.deviceId;
      return label;
    });
    const firstDeviceId = videoDevices[0].deviceId;
    await startStream(firstDeviceId);
    _framebuffer = new figment.Framebuffer(_video.width, _video.height);
    _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
    shouldLoad = true;
  } catch (err) {
    console.error('No camera input!', err.name);
  }
};

async function startStream(deviceId) {
  try {
    if (_stream && _stream.active) {
      _stream.getTracks().forEach((track) => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    });
    if (!_video) {
      _video = document.createElement('video');
      _video.width = 1280;
      _video.height = 960;
    }
    _video.srcObject = stream;
    _video.play();
    _stream = stream;
    console.log('Stream started:', stream);
  } catch (err) {
    console.error('Failed to start camera input:', err.name);
  }
}

node.onRender = () => {
  if (!_video || !_framebuffer || _video.readyState !== _video.HAVE_ENOUGH_DATA || !shouldLoad) return;
  _framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
  shouldLoad = false;
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream && _stream.active) {
    _stream.getTracks().forEach((track) => track.stop());
    _video = null;
  }
};

function setShouldLoad() {
  shouldLoad = true;
}

async function updateSource() {
  const selectedLabel = operationIn.value;
  const selectedDeviceId = deviceMap[selectedLabel];
  if (selectedDeviceId) {
    console.log('Switching video source to:', selectedLabel, selectedDeviceId);
    await startStream(selectedDeviceId);
  } else {
    console.error('Invalid device selection');
  }
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
};

operationIn.onChange = updateSource;
