/**
 * @name Crop
 * @description Crop an input image
 * @category image
 */

const FRAGMENT_WGSL_CROP = `
struct Uniforms {
  u_resolution: vec2f,
  u_crop_size: vec2f,
  u_anchor: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let crop_ratio = u.u_crop_size / u.u_resolution;
  let anchor_offset = u.u_anchor * (vec2f(1.0) - crop_ratio);
  let uv = in.uv * crop_ratio + anchor_offset;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return textureSampleLevel(u_input_texture, defaultSampler, uv, 0.0);
}
`;

const FRAGMENT_WGSL_ORIGINAL = `
struct Uniforms {
  u_resolution: vec2f,
  u_crop_size: vec2f,
  u_anchor: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let crop_ratio = u.u_crop_size / u.u_resolution;
  let anchor_offset = u.u_anchor * (vec2f(1.0) - crop_ratio);
  let min_bound = anchor_offset;
  let max_bound = anchor_offset + crop_ratio;

  if (in.uv.x < min_bound.x || in.uv.x > max_bound.x ||
      in.uv.y < min_bound.y || in.uv.y > max_bound.y) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return textureSampleLevel(u_input_texture, defaultSampler, in.uv, 0.0);
}
`;

const imageIn = node.imageIn('in');
const widthIn = node.numberIn('width', 512.0, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512.0, { min: 1, max: 4096, step: 1 });
const anchorIn = node.selectIn(
  'anchor',
  ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'],
  'center',
);
const modeIn = node.selectIn('output size', ['cropped', 'original'], 'cropped');
const imageOut = node.imageOut('out');

const uniformsMeta = { u_resolution: 'vec2f', u_crop_size: 'vec2f', u_anchor: 'vec2f' };

let pipelineCrop, pipelineOriginal, target;

node.onStart = () => {
  pipelineCrop = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL_CROP,
    uniforms: uniformsMeta,
    textures: ['u_input_texture'],
    label: 'crop-cropped',
  });
  pipelineOriginal = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL_ORIGINAL,
    uniforms: uniformsMeta,
    textures: ['u_input_texture'],
    label: 'crop-original',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;

  const isOriginal = modeIn.value === 'original';
  const targetWidth = isOriginal ? imageIn.value.width : widthIn.value;
  const targetHeight = isOriginal ? imageIn.value.height : heightIn.value;

  const anchorMap = {
    'top-left': [0, 0],
    'top-center': [0.5, 0],
    'top-right': [1, 0],
    'center-left': [0, 0.5],
    center: [0.5, 0.5],
    'center-right': [1, 0.5],
    'bottom-left': [0, 1],
    'bottom-center': [0.5, 1],
    'bottom-right': [1, 1],
  };

  const anchor = anchorMap[anchorIn.value];
  const activePipeline = isOriginal ? pipelineOriginal : pipelineCrop;

  target.setSize(targetWidth, targetHeight);
  figment.drawFullscreen(
    activePipeline,
    {
      u_resolution: [imageIn.value.width, imageIn.value.height],
      u_crop_size: [widthIn.value, heightIn.value],
      u_anchor: anchor,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
