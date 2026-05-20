/**
 * @name Segment Pose
 * @description Remove the background from an image using MediaPipe pose segmentation.
 * @category ml
 */

const fragmentShader = `
struct Uniforms {
  u_operation: i32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_source_texture: texture_2d<f32>;
@group(0) @binding(3) var u_mask_texture: texture_2d<f32>;

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let input_color = textureSample(u_source_texture, defaultSampler, in.uv);
  let mask_color = textureSample(u_mask_texture, defaultSampler, in.uv);
  let mask_value = mask_color.r; // Use red channel as mask

  if (u.u_operation == 0) {
    // Remove background: keep foreground where mask is white
    return vec4f(input_color.rgb, input_color.a * mask_value);
  } else {
    // Remove foreground: keep background where mask is black
    return vec4f(input_color.rgb, input_color.a * (1.0 - mask_value));
  }
}
`;

const imageIn = node.imageIn('in');
const operationIn = node.selectIn('remove', ['background', 'foreground']);
const numPosesIn = node.numberIn('number of poses', 1, { min: 1, max: 4, step: 1 });
const modelIn = node.selectIn('model', ['lite', 'full', 'heavy'], 'lite');

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');
const maskOut = node.imageOut('mask');

let _resultTarget, _maskTarget;
let _pipelineInfo;
let _mpClient = null;
let _readback = null;
let _maskRgbaBuffer = null;
let _profileSequence = 0;

async function measureAsyncPhase(name, fn) {
  const id = _profileSequence++;
  const startMark = `${name}:start:${id}`;
  const endMark = `${name}:end:${id}`;
  performance.mark(startMark);
  try {
    return await fn();
  } finally {
    performance.mark(endMark);
    try {
      performance.measure(name, startMark, endMark);
    } catch (_) {}
  }
}

function measurePhase(name, fn) {
  const id = _profileSequence++;
  const startMark = `${name}:start:${id}`;
  const endMark = `${name}:end:${id}`;
  performance.mark(startMark);
  try {
    return fn();
  } finally {
    performance.mark(endMark);
    try {
      performance.measure(name, startMark, endMark);
    } catch (_) {}
  }
}

node.onStart = async () => {
  _pipelineInfo = figment.createRenderPipeline({
    wgsl: fragmentShader,
    uniforms: { u_operation: 'int' },
    textures: ['u_source_texture', 'u_mask_texture'],
    label: 'segmentPose',
  });
  _resultTarget = new figment.RenderTarget({ label: 'segmentPose-result' });
  _maskTarget = new figment.RenderTarget({ label: 'segmentPose-mask' });
  _readback = figment.createTextureReadback();
  _mpClient = new figment.MediaPipeWorkerClient('segmentPose', {
    taskFile: `pose_landmarker_${modelIn.value}.task`,
    taskOptions: { runningMode: 'IMAGE', numPoses: numPosesIn.value, outputSegmentationMasks: true },
  });
};

node.onRender = async () => {
  if (!imageIn.value) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  _resultTarget.setSize(width, height);
  try {
    const frame = _mpClient.borrowFrame(width, height);
    await measureAsyncPhase('mediapipe:segmentPose:input-readback', () => _readback.read(imageIn.value, frame));
    const res = await measureAsyncPhase('mediapipe:segmentPose:infer', () => _mpClient.inferRgba(frame, width, height));
    await drawWorkerResult(res);
  } catch (_) {
    // reinit/terminate during rapid param changes; ignore frame
  }
};

// Removed legacy sync path; worker result is handled in drawWorkerResult.

async function drawWorkerResult(result) {
  if (!imageIn.value || !result) {
    imageOut.set(imageIn.value);
    detectedOut.value = false;
    landmarksOut.value = null;
    maskOut.set(null);
    return;
  }

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (result.landmarks && result.landmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = result.landmarks;

    if (result.mask) {
      const maskData = new Uint8Array(result.mask);
      const maskByteLength = width * height * 4;
      if (!_maskRgbaBuffer || _maskRgbaBuffer.length !== maskByteLength) {
        _maskRgbaBuffer = new Uint8ClampedArray(maskByteLength);
      }

      for (let i = 0; i < maskData.length; i++) {
        const p = i * 4;
        const v = maskData[i];
        _maskRgbaBuffer[p] = v;
        _maskRgbaBuffer[p + 1] = v;
        _maskRgbaBuffer[p + 2] = v;
        _maskRgbaBuffer[p + 3] = 255;
      }

      _maskTarget.setSize(width, height);
      measurePhase('mediapipe:segmentPose:mask-upload', () => {
        _maskTarget.uploadBytes(_maskRgbaBuffer, { bytesPerRow: width * 4 });
      });
      maskOut.set(_maskTarget);

      _resultTarget.setSize(width, height);
      figment.drawFullscreen(
        _pipelineInfo,
        { u_operation: operationIn.value === 'background' ? 0 : 1 },
        { u_source_texture: imageIn.value, u_mask_texture: _maskTarget },
        _resultTarget,
      );
      imageOut.set(_resultTarget);
    } else {
      imageOut.set(imageIn.value);
      maskOut.set(null);
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
    maskOut.set(null);
    if (operationIn.value === 'background') {
      _resultTarget.setSize(width, height);
      figment.clearRenderTarget(_resultTarget);
      imageOut.set(_resultTarget);
    } else {
      imageOut.set(imageIn.value);
    }
  }
}

function updateOptions() {
  if (_mpClient) {
    _mpClient.setOptions({ numPoses: numPosesIn.value });
  }
}

numPosesIn.onChange = updateOptions;
modelIn.onChange = async () => {
  if (_mpClient) {
    await _mpClient.reinit({
      taskFile: `pose_landmarker_${modelIn.value}.task`,
      taskOptions: { runningMode: 'IMAGE', numPoses: numPosesIn.value, outputSegmentationMasks: true },
    });
  }
};

node.onStop = () => {
  if (_mpClient) _mpClient.terminate();
  _mpClient = null;
  _readback?.destroy();
  _readback = null;
  _maskRgbaBuffer = null;
  if (_resultTarget) _resultTarget.destroy();
  if (_maskTarget) _maskTarget.destroy();
};
