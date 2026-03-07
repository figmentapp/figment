/**
 * @name Mask Ellipse
 * @description Draw a circular mask of an image or color.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_radius: f32,
  u_invert: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn draw_circle(coord: vec2f, radius: f32) -> f32 {
  return step(length(coord), radius);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let color = textureSample(u_input_texture, defaultSampler, uv);
  let offset = vec2f(0.5, 0.5);
  var circle = draw_circle(uv - offset, u.u_radius);
  if (u.u_invert > 0.5) {
    circle = 1.0 - circle;
  }
  let colort = vec3f(circle);
  return vec4f(colort, 1.0) * color;
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 0.5, step: 0.01 });
const invertIn = node.toggleIn('invert', true);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_radius: 'f32', u_invert: 'f32' },
    textures: ['u_input_texture'],
    label: 'maskCircle',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    { u_radius: radiusIn.value, u_invert: invertIn.value ? 1.0 : 0.0 },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
