/**
 * @name Radial Distortion
 * @description Radial distortion on image.
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
  var uv = in.uv - 0.5;
  var radius = length(uv);
  let angle = atan2(uv.y, uv.x);
  radius += cos(angle * 4.0 + u.u_time) * u.u_distortion;
  uv = radius * vec2f(cos(angle), sin(angle));
  uv += 0.5;
  return textureSample(u_input_texture, defaultSampler, uv);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const rotate = node.numberIn('rotate', 1.0, { min: 0.0, max: 25.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_distortion: 'f32', u_time: 'f32' },
    textures: ['u_input_texture'],
    label: 'radialDistortion',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_distortion: dist.value, u_time: rotate.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
