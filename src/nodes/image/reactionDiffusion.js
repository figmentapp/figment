/**
 * @name Reaction Diffusion
 * @description Reaction diffusion on input image.
 * @category image
 */

const influenceIn = node.numberIn('influence', 0.15, { min: 0.0, max: 1.0, step: 0.01 });
const deltaTimeIn = node.numberIn('delta time', 1.0);
const feedRateIn = node.numberIn('feed rate', 0.037, { min: 0.0, max: 0.1, step: 0.0001 });
const killRateIn = node.numberIn('kill rate', 0.06, { min: 0.0, max: 0.1, step: 0.0001 });
const diffusionRateAIn = node.numberIn('diffusion A', 0.2097, { min: 0.0, max: 1.0, step: 0.0001 });
const diffusionRateBIn = node.numberIn('diffusion B', 0.105, { min: 0.0, max: 1.0, step: 0.0001 });
const iterationsIn = node.numberIn('iterations', 10, { min: 1, max: 50, step: 1 });
const resetIn = node.triggerButtonIn('reset');

const result = figment.createFeedbackFilter(node, {
  label: 'reactionDiffusion',
  uniforms: {
    u_resolution: 'vec2f',
    u_influence: 'f32',
    u_delta_time: 'f32',
    u_feed_rate: 'f32',
    u_kill_rate: 'f32',
    u_diffusion_rate_a: 'f32',
    u_diffusion_rate_b: 'f32',
  },
  wgsl: `
    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      let texel_size = 1.0 / u.u_resolution;

      let current = textureSample(u_feedback_texture, defaultSampler, uv);
      let laplacian = textureSample(u_feedback_texture, defaultSampler, uv + vec2f(-1.0, 0.0) * texel_size) +
                      textureSample(u_feedback_texture, defaultSampler, uv + vec2f(1.0, 0.0) * texel_size) +
                      textureSample(u_feedback_texture, defaultSampler, uv + vec2f(0.0, -1.0) * texel_size) +
                      textureSample(u_feedback_texture, defaultSampler, uv + vec2f(0.0, 1.0) * texel_size) -
                      4.0 * current;

      let pixel = current + textureSample(u_input_texture, defaultSampler, uv) * u.u_influence;
      let a = pixel.r;
      let b = pixel.g;

      let reaction = a * b * b;
      let da = u.u_diffusion_rate_a * laplacian.r - reaction + u.u_feed_rate * (1.0 - a);
      let db = u.u_diffusion_rate_b * laplacian.g + reaction - (u.u_kill_rate + u.u_feed_rate) * b;

      let rd_result = current.rg + vec2f(da, db) * u.u_delta_time;
      return vec4f(rd_result.r, rd_result.g, 0.0, 1.0);
    }
  `,
  getUniforms: () => ({
    u_resolution: [result.pp.width, result.pp.height],
    u_influence: influenceIn.value,
    u_delta_time: deltaTimeIn.value,
    u_feed_rate: feedRateIn.value,
    u_kill_rate: killRateIn.value,
    u_diffusion_rate_a: diffusionRateAIn.value,
    u_diffusion_rate_b: diffusionRateBIn.value,
  }),
  iterations: () => iterationsIn.value,
});

function resetSimulation() {
  result.pp.destroy();
  result.pp = new figment.PingPongTarget();
}
node.onReset = resetSimulation;
resetIn.onTrigger = resetSimulation;
