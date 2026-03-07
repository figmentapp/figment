/**
 * @name Colorify
 * @description Repaint image in color of choice.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_color: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let texel = textureSample(u_input_texture, defaultSampler, in.uv);
  let luma = vec3f(0.299, 0.587, 0.114);
  let v = dot(texel.xyz, luma);
  return vec4f(v * u.u_color.rgb, texel.w);
}
`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('color', [255, 130, 0, 0.5]);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_color: 'vec4f' },
    textures: ['u_input_texture'],
    label: 'colorify',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  const color = colorIn.value;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_color: figment.colorToVec4(color) }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
