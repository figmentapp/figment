/**
 * @name Screen Distortion
 * @description Simple distortion on image.
 * @category image
 */

const dist = node.numberIn('distortion', 0.2, { min: 0.0, max: 1.5, step: 0.01 });
const linesIn = node.selectIn('Lines', ['On', 'Off']);

const LINES_MAP = { On: 1.0, Off: 0.0 };

const result = figment.createImageFilter(node, {
  label: 'screenDistortion',
  uniforms: { u_distortion: 'f32', u_lines: 'f32', u_resolution: 'vec2f' },
  wgsl: `
    fn sawtooth(t: f32) -> f32 {
      return abs(((abs(t)) % 2.0) - 1.0);
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      var uv = in.uv;
      let distpow = (1.2 - u.u_distortion) * 10.0;

      let ctr = vec2f(0.5, 0.5);
      var ctrvec = ctr - uv;
      let ctrdist = length(ctrvec);
      ctrvec /= ctrdist;
      uv += ctrvec * max(0.0, pow(ctrdist, distpow) - 0.0025);

      let div = 40.0 * vec2f(1.0, u.u_resolution.y / u.u_resolution.x);
      var lines = 0.0;
      lines += smoothstep(0.2, 0.0, sawtooth(uv.x * 2.0 * div.x));
      lines += smoothstep(0.2, 0.0, sawtooth(uv.y * 2.0 * div.y));
      lines = clamp(lines, 0.0, 1.0);
      var outcol = textureSample(u_input_texture, defaultSampler, uv).rgb;
      if (u.u_lines == 1.0) {
        outcol *= vec3f(1.0 - lines);
      }

      let valid = step(vec2f(0.0), uv) * step(uv, vec2f(1.0));
      outcol *= valid.x * valid.y;
      return vec4f(outcol, 1.0);
    }
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return {
      u_distortion: dist.value,
      u_lines: LINES_MAP[linesIn.value] ?? 0.0,
      u_resolution: [img.width, img.height],
    };
  },
});
