/**
 * @name Sepia
 * @description Sepia filter on image.
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
  let sepia = vec3f(1.2, 1.0, 0.8) * u.u_factor;
  let gray = vec3f(dot(color.rgb, vec3f(0.299, 0.587, 0.114)));
  let final_color = mix(gray, gray * sepia, vec3f(0.5));
  return vec4f(final_color, color.a);
}
`;

const imageIn = node.imageIn('in');
const sepiaIn = node.numberIn('sepia factor', 1.0, { min: 0.0, max: 2.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_factor: 'f32' },
    textures: ['u_input_texture'],
    label: 'sepia',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_factor: sepiaIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
