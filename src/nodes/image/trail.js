/**
 * @name Trail
 * @description Don't erase the previous input image, creating a trail.
 * @category image
 */

const fadeParam = node.numberIn('fade', 0, { min: 0, max: 1, step: 0.01 });
const clearButtonIn = node.triggerButtonIn('clear');

const result = figment.createFeedbackFilter(node, {
  label: 'trail',
  uniforms: { u_fade: 'f32', u_seed: 'f32' },
  wgsl: `
    fn random(st: vec2f) -> f32 {
      return fract(sin(dot(st, vec2f(12.9898, 78.233))) * 43758.5453123);
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      var prev = textureSample(u_feedback_texture, defaultSampler, in.uv);
      let next = textureSample(u_input_texture, defaultSampler, in.uv);

      let fade = pow(u.u_fade, 4.0);
      let noise = random(in.uv + u.u_seed);

      if (noise < fade) {
        prev = vec4f(0.0);
      }

      let outA = next.a + prev.a * (1.0 - next.a);
      var outRGB = vec3f(0.0);
      if (outA > 0.0) {
        outRGB = (next.rgb * next.a + prev.rgb * prev.a * (1.0 - next.a)) / outA;
      }

      return vec4f(outRGB, outA);
    }
  `,
  getUniforms: () => ({ u_fade: fadeParam.value, u_seed: Math.random() }),
});

clearButtonIn.onTrigger = () => {
  result.pp.destroy();
  result.pp = new figment.PingPongTarget();
};
