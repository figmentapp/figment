/**
 * @name Noise
 * @description Adds noise on input image.
 * @category image
 */

const noiseIn = node.numberIn('noise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const seedIn = node.numberIn('seed', 2.0, { min: 0.0, max: 100.0, step: 0.0001 });

figment.createImageFilter(node, {
  label: 'noise',
  uniforms: { u_seed: 'f32', u_noise_intensity: 'f32' },
  wgsl: `
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
  `,
  getUniforms: () => ({
    u_seed: seedIn.value,
    u_noise_intensity: noiseIn.value,
  }),
});
