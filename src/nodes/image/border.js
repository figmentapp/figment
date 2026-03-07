/**
 * @name Border
 * @description Generate a border around the image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_border_color: vec4f,
  u_resolution: vec2f,
  u_border_size: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let border_frac = u.u_border_size / u.u_resolution.x;
  if (in.uv.x < border_frac || in.uv.x > 1.0 - border_frac || in.uv.y < border_frac || in.uv.y > 1.0 - border_frac) {
    return u.u_border_color;
  }
  return textureSampleLevel(u_input_texture, defaultSampler, in.uv, 0.0);
}
`;

const imageIn = node.imageIn('in');
const borderSize = node.numberIn('borderSize', 10.0, { min: 1, max: 512, step: 1 });
const borderColor = node.colorIn('borderColor', [255, 255, 255, 1.0]);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_border_color: 'vec4f', u_resolution: 'vec2f', u_border_size: 'f32' },
    textures: ['u_input_texture'],
    label: 'border',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_border_color: [borderColor.value[0] / 255, borderColor.value[1] / 255, borderColor.value[2] / 255, borderColor.value[3]],
      u_resolution: [imageIn.value.width, imageIn.value.height],
      u_border_size: borderSize.value,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
