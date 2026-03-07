/**
 * @name Sharpen
 * @description Sharpen an input image.
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
  let bot = 1.0 - u.u_step;
  let top = 1.0 + u.u_step;
  let cen = 1.0;

  let result = textureSample(u_input_texture, defaultSampler, uv) * 2.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(bot, bot)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(cen, bot)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(top, bot)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(bot, cen)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(top, cen)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(bot, top)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(cen, top)) / 8.0
    - textureSample(u_input_texture, defaultSampler, uv * vec2f(top, top)) / 8.0;

  return result;
}
`;

const imageIn = node.imageIn('in');
const sharpenIn = node.numberIn('amount', 0.005, { min: 0, max: 0.1, step: 0.001 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_step: 'f32' },
    textures: ['u_input_texture'],
    label: 'sharpen',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_step: sharpenIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
