/**
 * @name Segment Pose
 * @description Remove the background from an image using MediaPipe pose segmentation.
 * @category ml
 */

// Runs the MediaPipe pose models natively on the GPU (see
// src/mediapipe-gpu.js): the frame and the segmentation mask never leave
// the GPU; only landmarks (~1 KB per pose) are read back each frame.

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

let _resultTarget;
let _pipelineInfo;
let _pose = null;
let _busy = false;

node.onStart = async () => {
  _pipelineInfo = figment.createRenderPipeline({
    wgsl: fragmentShader,
    uniforms: { u_operation: 'int' },
    textures: ['u_source_texture', 'u_mask_texture'],
    label: 'segmentPose',
  });
  _resultTarget = new figment.RenderTarget({ label: 'segmentPose-result' });
  _pose = new figment.PoseGpuPipeline({ model: modelIn.value, maxInstances: numPosesIn.value, withMask: true });
  await _pose.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_pose || _busy) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _resultTarget.setSize(width, height);

  _busy = true;
  let results;
  try {
    results = await _pose.process(imageIn.value);
  } catch (err) {
    node.error = err && err.stack ? err.stack : String(err);
    return;
  } finally {
    _busy = false;
  }

  if (results.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = results.map((r) => r.landmarks);
    maskOut.set(_pose.maskTarget);
    figment.drawFullscreen(
      _pipelineInfo,
      { u_operation: operationIn.value === 'background' ? 0 : 1 },
      { u_source_texture: imageIn.value, u_mask_texture: _pose.maskTarget },
      _resultTarget,
    );
    imageOut.set(_resultTarget);
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
    maskOut.set(null);
    if (operationIn.value === 'background') {
      figment.clearRenderTarget(_resultTarget);
      imageOut.set(_resultTarget);
    } else {
      imageOut.set(imageIn.value);
    }
  }
};

numPosesIn.onChange = () => {
  if (_pose) _pose.maxInstances = numPosesIn.value;
};

modelIn.onChange = async () => {
  if (!_pose) return;
  try {
    await _pose.setModel(modelIn.value);
  } catch (err) {
    node.error = err && err.stack ? err.stack : String(err);
  }
};

node.onStop = () => {
  if (_pose) _pose.destroy();
  _pose = null;
  if (_resultTarget) _resultTarget.destroy();
};
