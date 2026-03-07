/**
 * @name Solarize
 * @description Solarize filter on image.
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
  let color = textureSample(u_input_texture, defaultSampler, in.uv);
  let solarized_color = clamp(color.rgb, vec3f(0.0), vec3f(1.0));
  let result = mix(solarized_color, 1.0 - solarized_color, step(vec3f(u.u_threshold), solarized_color));
  return vec4f(result, color.a);
}
`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.0, { min: 0.0, max: 1.5, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_threshold: 'f32' },
    textures: ['u_input_texture'],
    label: 'solarize',
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
