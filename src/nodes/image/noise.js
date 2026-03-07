/**
 * @name Noise
 * @description Adds noise on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_seed: f32,
  u_noise_intensity: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn rand(n: vec2f) -> f32 {
  return fract(sin(dot(n, vec2f(12.9898, 78.233))) * 43758.5453 + u.u_seed);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let color = textureSample(u_input_texture, defaultSampler, uv);
  let noise = rand(uv) * u.u_noise_intensity;
  let noise_color = vec3f(noise);
  let blended_color = mix(color.rgb, noise_color, vec3f(0.5));
  return vec4f(blended_color, color.a);
}
`;

const imageIn = node.imageIn('in');
const noiseIn = node.numberIn('noise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const seedIn = node.numberIn('seed', 2.0, { min: 0.0, max: 100.0, step: 0.0001 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {
      u_seed: 'f32',
      u_noise_intensity: 'f32',
    },
    textures: ['u_input_texture'],
    label: 'noise',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_seed: seedIn.value,
      u_noise_intensity: noiseIn.value,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
