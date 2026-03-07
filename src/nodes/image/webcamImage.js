/**
 * @name Webcam Image
 * @description Return a webcam or virtual cam stream
 * @category image
 */

const MIRROR_WGSL = `
struct Uniforms {
  _pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return textureSample(u_input_texture, defaultSampler, vec2f(1.0 - in.uv.x, in.uv.y));
}
`;

node.timeDependent = true;
const frameRate = node.numberIn('frameRate', 30);
const operationIn = node.selectIn('camera', [], '0');
const mirrorIn = node.toggleIn('mirror', true);
const imageOut = node.imageOut('image');

let _video,
  _stream,
  _timer,
  _target,
  _mirrorTarget,
  _mirrorPipeline,
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
    _target = new figment.RenderTarget({ label: 'webcam' });
    _target.setSize(_video.width, _video.height);
    _mirrorTarget = new figment.RenderTarget({ label: 'webcam mirror' });
    _mirrorPipeline = figment.createRenderPipeline({
      wgsl: MIRROR_WGSL,
      uniforms: {},
      textures: ['u_input_texture'],
      label: 'webcam mirror',
    });
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
  } catch (err) {
    console.error('Failed to start camera input:', err.name);
  }
}

node.onRender = () => {
  if (!_video || !_target || _video.readyState !== _video.HAVE_ENOUGH_DATA || !shouldLoad) return;

  _target.setSize(_video.videoWidth || _video.width, _video.videoHeight || _video.height);
  _target.uploadExternal(_video);

  if (mirrorIn.value) {
    _mirrorTarget.setSize(_target.width, _target.height);
    figment.drawFullscreen(_mirrorPipeline, {}, { u_input_texture: _target }, _mirrorTarget);
    imageOut.set(_mirrorTarget);
  } else {
    imageOut.set(_target);
  }

  shouldLoad = false;
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream && _stream.active) {
    _stream.getTracks().forEach((track) => track.stop());
    _video = null;
  }
  _target?.destroy();
  _mirrorTarget?.destroy();
};

function setShouldLoad() {
  shouldLoad = true;
}

async function updateSource() {
  const selectedLabel = operationIn.value;
  const selectedDeviceId = deviceMap[selectedLabel];
  if (selectedDeviceId) {
    await startStream(selectedDeviceId);
    if (_target) _target.setSize(_video.width, _video.height);
    if (_mirrorTarget) _mirrorTarget.setSize(_video.width, _video.height);
  } else {
    console.error('Invalid device selection');
  }
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
};

operationIn.onChange = updateSource;
