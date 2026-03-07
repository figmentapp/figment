/**
 * @name Reduce Color
 * @description Reduce the amount of colors of input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_factor: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(u_input_texture, defaultSampler, in.uv);
  let col = floor(color.rgb * u.u_factor) / u.u_factor;
  return vec4f(col, 1.0);
}
`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('reduce colors', 2.0, { min: 0.0, max: 100.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_factor: 'f32' },
    textures: ['u_input_texture'],
    label: 'reduceColor',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_factor: factorIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
