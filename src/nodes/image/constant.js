/**
 * @name Constant
 * @description Render a constant color.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_color: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return u.u_color;
}
`;

const colorIn = node.colorIn('color', [128, 128, 128, 1.0]);
const widthIn = node.numberIn('width', 1024, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_color: 'vec4f' },
    textures: [],
    label: 'constant',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  target.setSize(widthIn.value, heightIn.value);
  figment.drawFullscreen(pipeline, { u_color: figment.colorToVec4(colorIn.value) }, {}, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
