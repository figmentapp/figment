/**
 * @name Wrap
 * @description Circular wrap of input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_radius: f32,
  u_twist: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;
  var p = -1.0 + 2.0 * uv;
  let r = sqrt(dot(p, p));

  p.x = (p.x + r * u.u_twist) - floor(p.x + r * u.u_twist);
  let a = atan2(p.y, p.x);

  uv.x = (a + 3.14159265359) / 6.28318530718;
  uv.y = r / sqrt(u.u_radius);
  let col = textureSample(u_input_texture, defaultSampler, uv).rgb;
  return vec4f(col, 1.0);
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 2.0, { min: 0, max: 5, step: 0.01 });
const twistIn = node.numberIn('twist', 0.0, { min: -1, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_radius: 'f32', u_twist: 'f32' },
    textures: ['u_input_texture'],
    label: 'wrap',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_radius: radiusIn.value, u_twist: twistIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
