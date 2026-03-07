/**
 * @name Blur
 * @description Blur an input image
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_step: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let s = u.u_step;

  let color =
    textureSample(u_input_texture, defaultSampler, uv + vec2f(-s, -s)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(-s, 0.0)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(-s, s)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, -s)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, 0.0)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, s)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(s, -s)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(s, 0.0)) / 8.0 +
    textureSample(u_input_texture, defaultSampler, uv + vec2f(s, s)) / 8.0;

  return color;
}
`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_step: 'f32' },
    textures: ['u_input_texture'],
    label: 'blur',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_step: blurIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
