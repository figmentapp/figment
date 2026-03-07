/**
 * @name Threshold
 * @description Change brightness threshold of input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_threshold: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let col = textureSample(u_input_texture, defaultSampler, in.uv).rgb;
  let brightness = 0.33333 * (col.r + col.g + col.b);
  let b = mix(0.0, 1.0, step(u.u_threshold, brightness));
  return vec4f(b, b, b, 1.0);
}
`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_threshold: 'f32' },
    textures: ['u_input_texture'],
    label: 'threshold',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_threshold: thresholdIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
