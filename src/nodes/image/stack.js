/**
 * @name Stack
 * @description Combine 2 images horizontally / vertically.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_direction: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture_1: texture_2d<f32>;
@group(0) @binding(3) var u_input_texture_2: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  if (u.u_direction == 0.0) {
    if (uv.x < 0.5) {
      return textureSampleLevel(u_input_texture_1, defaultSampler, vec2f(uv.x * 2.0, uv.y), 0.0);
    } else {
      return textureSampleLevel(u_input_texture_2, defaultSampler, vec2f(uv.x * 2.0 - 1.0, uv.y), 0.0);
    }
  } else {
    if (uv.y < 0.5) {
      return textureSampleLevel(u_input_texture_1, defaultSampler, vec2f(uv.x, uv.y * 2.0), 0.0);
    } else {
      return textureSampleLevel(u_input_texture_2, defaultSampler, vec2f(uv.x, uv.y * 2.0 - 1.0), 0.0);
    }
  }
}
`;

const imageIn1 = node.imageIn('image 1');
const imageIn2 = node.imageIn('image 2');
const directionIn = node.selectIn('Direction', ['Horizontal', 'Vertical']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_direction: 'f32' },
    textures: ['u_input_texture_1', 'u_input_texture_2'],
    label: 'stack',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn1.value || !imageIn2.value) return;
  let u_direction;
  if (directionIn.value === 'Horizontal') {
    u_direction = 0.0;
    target.setSize(imageIn1.value.width + imageIn2.value.width, imageIn1.value.height);
  } else {
    u_direction = 1.0;
    target.setSize(imageIn1.value.width, imageIn1.value.height + imageIn2.value.height);
  }
  figment.drawFullscreen(pipeline, { u_direction }, { u_input_texture_1: imageIn1.value, u_input_texture_2: imageIn2.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
