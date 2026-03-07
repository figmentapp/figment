/**
 * @name Pixelate
 * @description Pixelate input image (Mosaic effect).
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_cell_size: f32,
  _pad1: f32,
  u_resolution: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let cells = u.u_resolution / u.u_cell_size;
  let cell_uv = floor(in.uv * cells) / cells;
  let color = textureSample(u_input_texture, defaultSampler, cell_uv).rgb;
  return vec4f(color, 1.0);
}
`;

const imageIn = node.imageIn('in');
const cellSize = node.numberIn('cell size', 32, { min: 1, max: 200, step: 1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_cell_size: 'f32', _pad1: 'f32', u_resolution: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'pixelate',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    { u_cell_size: cellSize.value, u_resolution: [imageIn.value.width, imageIn.value.height] },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
