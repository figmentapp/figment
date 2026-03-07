/**
 * @name Gaussian Blur
 * @description Change the colors of the input image.
 * @category image
 */

// https://www.rastergrid.com/blog/2010/09/efficient-gaussian-blur-with-linear-sampling/
const FRAGMENT_WGSL = `
struct Uniforms {
  u_factor: f32,
  u_rtx: f32,
  u_rty: f32,
  _pad1: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

const offsets = array<f32, 3>(0.0, 1.3846153846, 3.2307692308);
const weights = array<f32, 3>(0.2270270270, 0.3162162162, 0.0702702703);

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  var col = textureSample(u_input_texture, defaultSampler, uv).rgb * weights[0];

  for (var i: i32 = 1; i < 3; i++) {
    col += textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, offsets[i] * u.u_factor / u.u_rty)).rgb * weights[i];
    col += textureSample(u_input_texture, defaultSampler, uv - vec2f(0.0, offsets[i] * u.u_factor / u.u_rty)).rgb * weights[i];
  }

  for (var i: i32 = 1; i < 3; i++) {
    col += textureSample(u_input_texture, defaultSampler, uv + vec2f(offsets[i] * u.u_factor / u.u_rtx, 0.0)).rgb * weights[i];
    col += textureSample(u_input_texture, defaultSampler, uv - vec2f(offsets[i] * u.u_factor / u.u_rtx, 0.0)).rgb * weights[i];
  }

  return vec4f(col / 2.0, 1.0);
}
`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('factor', 0, { min: 0.0, max: 5.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_factor: 'f32', u_rtx: 'f32', u_rty: 'f32', _pad1: 'f32' },
    textures: ['u_input_texture'],
    label: 'gaussianBlur',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_factor: factorIn.value,
      u_rtx: imageIn.value.width,
      u_rty: imageIn.value.height,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
