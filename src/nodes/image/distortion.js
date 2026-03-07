/**
 * @name Distortion
 * @description Simple distortion on image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_distortion: f32,
  u_time: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;
  let X = uv.x * 6.0 + u.u_time;
  let Y = uv.y * 6.0 + u.u_time;
  uv.x += cos(X + Y) * u.u_distortion * cos(Y);
  uv.y += sin(X + Y) * u.u_distortion * sin(Y);
  return textureSample(u_input_texture, defaultSampler, uv);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const wave = node.numberIn('wave', 1.0, { min: 0.0, max: 10.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_distortion: 'f32', u_time: 'f32' },
    textures: ['u_input_texture'],
    label: 'distortion',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_distortion: dist.value, u_time: wave.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
