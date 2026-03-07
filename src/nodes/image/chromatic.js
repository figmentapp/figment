/**
 * @name Chromatic
 * @description Adds chromatic abberation to input image.
 * @category image
 */

const factorIn = node.numberIn('factor', 0.05, { min: 0.0, max: 0.2, step: 0.001 });

figment.createImageFilter(node, {
  label: 'chromatic',
  uniforms: { u_factor: 'f32' },
  wgsl: `
    fn CRTCurveUV(uv_in: vec2f, str: f32) -> vec2f {
      var uv = uv_in * 2.0 - 1.0;
      let offset = (str * abs(uv.yx)) / vec2f(6.0, 4.0);
      uv = uv + uv * offset * offset;
      uv = uv * 0.5 + 0.5;
      return uv;
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      var uv = CRTCurveUV(in.uv, 0.5);

      let caStrength = u.u_factor;
      let caOffset = uv - 0.5;
      let caUVG = uv + caOffset * caStrength;
      let caUVB = uv + caOffset * caStrength * 2.0;

      var color: vec3f;
      color.x = textureSample(u_input_texture, defaultSampler, uv).x;
      color.y = textureSample(u_input_texture, defaultSampler, caUVG).y;
      color.z = textureSample(u_input_texture, defaultSampler, caUVB).z;

      uv = CRTCurveUV(in.uv, 1.0);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        color = vec3f(0.0, 0.0, 0.0);
      }
      let vignette = clamp(pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.3), 0.0, 1.0);
      color *= vignette * 1.1;

      return vec4f(color, 1.0);
    }
  `,
  getUniforms: () => ({ u_factor: factorIn.value }),
});
