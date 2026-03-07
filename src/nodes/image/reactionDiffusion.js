/**
 * @name Reaction Diffusion
 * @description Reaction diffusion on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_resolution: vec2f,
  u_influence: f32,
  u_delta_time: f32,
  u_feed_rate: f32,
  u_kill_rate: f32,
  u_diffusion_rate_a: f32,
  u_diffusion_rate_b: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;
@group(0) @binding(3) var u_prev_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let texel_size = 1.0 / u.u_resolution;

  let current = textureSample(u_input_texture, defaultSampler, uv);
  let laplacian = textureSample(u_input_texture, defaultSampler, uv + vec2f(-1.0, 0.0) * texel_size) +
                  textureSample(u_input_texture, defaultSampler, uv + vec2f(1.0, 0.0) * texel_size) +
                  textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, -1.0) * texel_size) +
                  textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, 1.0) * texel_size) -
                  4.0 * current;

  let pixel = current + textureSample(u_prev_texture, defaultSampler, uv) * u.u_influence;
  let a = pixel.r;
  let b = pixel.g;

  let reaction = a * b * b;
  let da = u.u_diffusion_rate_a * laplacian.r - reaction + u.u_feed_rate * (1.0 - a);
  let db = u.u_diffusion_rate_b * laplacian.g + reaction - (u.u_kill_rate + u.u_feed_rate) * b;

  let result = current.rg + vec2f(da, db) * u.u_delta_time;
  return vec4f(result.r, result.g, 0.0, 1.0);
}
`;

const imageIn = node.imageIn('in');
const influenceIn = node.numberIn('influence', 0.15, { min: 0.0, max: 1.0, step: 0.01 });
const deltaTimeIn = node.numberIn('delta time', 1.0);
const feedRateIn = node.numberIn('feed rate', 0.037, { min: 0.0, max: 0.1, step: 0.0001 });
const killRateIn = node.numberIn('kill rate', 0.06, { min: 0.0, max: 0.1, step: 0.0001 });
const diffusionRateAIn = node.numberIn('diffusion A', 0.2097, { min: 0.0, max: 1.0, step: 0.0001 });
const diffusionRateBIn = node.numberIn('diffusion B', 0.105, { min: 0.0, max: 1.0, step: 0.0001 });
const iterationsIn = node.numberIn('iterations', 10, { min: 1, max: 50, step: 1 });
const resetIn = node.triggerButtonIn('reset');
const imageOut = node.imageOut('out');

let pipeline, target, pp;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {
      u_resolution: 'vec2f',
      u_influence: 'f32',
      u_delta_time: 'f32',
      u_feed_rate: 'f32',
      u_kill_rate: 'f32',
      u_diffusion_rate_a: 'f32',
      u_diffusion_rate_b: 'f32',
    },
    textures: ['u_input_texture', 'u_prev_texture'],
    label: 'reactionDiffusion',
  });
  target = new figment.RenderTarget();
  pp = new figment.PingPongTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  target.setSize(width, height);
  pp.setSize(width, height);

  const uniforms = {
    u_resolution: [width, height],
    u_influence: influenceIn.value,
    u_delta_time: deltaTimeIn.value,
    u_feed_rate: feedRateIn.value,
    u_kill_rate: killRateIn.value,
    u_diffusion_rate_a: diffusionRateAIn.value,
    u_diffusion_rate_b: diffusionRateBIn.value,
  };

  // Perform reaction-diffusion iterations
  for (let i = 0; i < iterationsIn.value; i++) {
    figment.drawFullscreen(pipeline, uniforms, { u_input_texture: pp.read, u_prev_texture: imageIn.value }, pp.write);
    pp.swap();
  }

  // Final output pass
  figment.drawFullscreen(pipeline, uniforms, { u_input_texture: pp.read, u_prev_texture: imageIn.value }, target);

  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
  pp?.destroy();
};

function resetSimulation() {
  if (pp) {
    pp.destroy();
    pp = new figment.PingPongTarget();
  }
}
node.onReset = resetSimulation;
resetIn.onTrigger = resetSimulation;
