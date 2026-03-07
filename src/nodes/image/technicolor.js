/**
 * @name Technicolor
 * @description Simulates the look of the two-strip technicolor process popular in early 20th century films.
 * @category image
 */

const FRAGMENT_WGSL = `
// http://www.widescreenmuseum.com/oldcolor/technicolor1.htm

struct Uniforms {
  _pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let tex = textureSample(u_input_texture, defaultSampler, in.uv);
  return vec4f(tex.r, (tex.g + tex.b) * 0.5, (tex.g + tex.b) * 0.5, 1.0);
}
`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {},
    textures: ['u_input_texture'],
    label: 'technicolor',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, {}, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
