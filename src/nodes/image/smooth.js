/**
 * @name Smooth
 * @description Temporally smooth an image over frames.
 * @category image
 */

const amountIn = node.numberIn('amount', 0.7, { min: 0, max: 1, step: 0.001 });
const modeIn = node.selectIn('mode', ['average', 'max', 'min'], 'average');
const clearIn = node.triggerButtonIn('clear');

const MODE_INDEX = { average: 0, max: 1, min: 2 };

let firstFrame = true;

const result = figment.createFeedbackFilter(node, {
  label: 'smooth',
  uniforms: { u_amount: 'f32', u_mode: 'u32', u_is_first_frame: 'u32' },
  wgsl: `
    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let prev = textureSample(u_feedback_texture, defaultSampler, in.uv);
      let curr = textureSample(u_input_texture, defaultSampler, in.uv);

      // First frame: skip the blend so the output starts at the input
      // instead of fading up from the cleared feedback target.
      if (u.u_is_first_frame == 1u) {
        return curr;
      }

      // Cubic curve puts useful range on the slow end: amount=0 passes
      // current through, amount=1 freezes. w is the weight of the current frame.
      let w = pow(1.0 - clamp(u.u_amount, 0.0, 1.0), 3.0);

      var out_rgb: vec3f;
      switch u.u_mode {
        case 1u: { out_rgb = max(curr.rgb, prev.rgb * (1.0 - w)); }
        case 2u: { out_rgb = min(curr.rgb, 1.0 - (1.0 - prev.rgb) * (1.0 - w)); }
        default: { out_rgb = mix(prev.rgb, curr.rgb, w); }
      }

      // Alpha always uses the average formula — max/min on alpha has no useful meaning.
      let out_a = mix(prev.a, curr.a, w);
      return vec4f(out_rgb, out_a);
    }
  `,
  getUniforms: () => {
    const isFirst = firstFrame ? 1 : 0;
    firstFrame = false;
    return {
      u_amount: amountIn.value,
      u_mode: MODE_INDEX[modeIn.value] ?? 0,
      u_is_first_frame: isFirst,
    };
  },
});

function clear() {
  result.pp.destroy();
  result.pp = new figment.PingPongTarget();
  firstFrame = true;
}
node.onReset = clear;
clearIn.onTrigger = clear;
