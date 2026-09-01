/**
 * @name Segment Image
 * @description Remove the background from an image using selfie segmentation.
 * @category ml
 */

// Runs MediaPipe's selfie segmenter model natively on the GPU (see
// src/mediapipe-gpu.js): the frame and the mask never leave the GPU.

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
// categoryMask: hard 0/1 mask (person probability > 0.5); confidenceMasks:
// the probability itself, for soft edges.
const outputTypeIn = node.selectIn('outputType', ['categoryMask', 'confidenceMasks'], 'categoryMask');

const imageOut = node.imageOut('out');
const maskOut = node.imageOut('mask');

let _resultTarget;
let _pipelineInfo;
let _segmenter = null;

node.onStart = async () => {
  _pipelineInfo = figment.createRenderPipeline({
    wgsl: fragmentShader,
    uniforms: { u_operation: 'int' },
    textures: ['u_source_texture', 'u_mask_texture'],
    label: 'segmentImage',
  });
  _resultTarget = new figment.RenderTarget({ label: 'segmentImage-result' });
  _segmenter = new figment.SegmentGpuPipeline({ binary: outputTypeIn.value === 'categoryMask' });
  await _segmenter.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_segmenter) return;
  _resultTarget.setSize(imageIn.value.width, imageIn.value.height);

  const mask = await _segmenter.process(imageIn.value);
  if (!_segmenter || !mask) return; // stopped while the frame was in flight

  maskOut.set(mask);
  figment.drawFullscreen(
    _pipelineInfo,
    { u_operation: operationIn.value === 'background' ? 0 : 1 },
    { u_source_texture: imageIn.value, u_mask_texture: mask },
    _resultTarget,
  );
  imageOut.set(_resultTarget);
};

outputTypeIn.onChange = () => {
  if (_segmenter) _segmenter.binary = outputTypeIn.value === 'categoryMask';
};

node.onStop = () => {
  if (_segmenter) _segmenter.destroy();
  _segmenter = null;
  if (_resultTarget) _resultTarget.destroy();
};
