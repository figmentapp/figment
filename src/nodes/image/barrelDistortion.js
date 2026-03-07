/**
 * @name Barrel Distortion
 * @description Barrel distortion on image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_distortion: f32,
  u_radius: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn barrelDistortion(uv_in: vec2f) -> vec2f {
  var uv = uv_in;
  let distortion = u.u_distortion;
  let r = uv.x * uv.x * u.u_radius + uv.y * uv.y * u.u_radius;
  uv *= 1.6 + distortion * r + distortion * r * r;
  return uv;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;
  uv = uv * 2.0 - 1.0;
  uv = barrelDistortion(uv);
  uv = 0.5 * (uv * 0.5 + 1.0);
  return textureSample(u_input_texture, defaultSampler, uv);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -5.0, max: 5.0, step: 0.1 });
const rad = node.numberIn('radius', 1.0, { min: 0.0, max: 3.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_distortion: 'f32', u_radius: 'f32' },
    textures: ['u_input_texture'],
    label: 'barrelDistortion',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_distortion: dist.value, u_radius: rad.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
