/**
 * @name Kaleidoscope
 * @description Radial reflection around center point of image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_sides: f32,
  u_angle: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let p_in = in.uv - 0.5;
  let r = length(p_in);
  var a = atan2(p_in.y, p_in.x) + u.u_angle;
  let tau = 2.0 * 3.1416;
  let sector = tau / u.u_sides;
  a = a - floor(a / sector) * sector;
  a = abs(a - sector / 2.0);
  let p = r * vec2f(cos(a), sin(a));
  let color = textureSample(u_input_texture, defaultSampler, p + 0.5);
  return color;
}
`;

const imageIn = node.imageIn('in');
const angleIn = node.numberIn('angle', 0.0, { min: 0.0, max: 6.3, step: 0.01 });
const sidesIn = node.numberIn('sides', 6.0, { min: 0.0, max: 35.0, step: 1.0 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_sides: 'f32', u_angle: 'f32' },
    textures: ['u_input_texture'],
    label: 'kaleidoscope',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_sides: sidesIn.value, u_angle: angleIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
