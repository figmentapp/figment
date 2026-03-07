/**
 * @name Center Around Gray
 * @description center around gray on image.
 * @category image
 */

const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'centerAroundGray',
  uniforms: { u_radius: 'f32', u_center: 'vec2f' },
  wgsl: `
    fn grayScale(col: vec3f) -> f32 {
      return dot(col, vec3f(0.3, 0.59, 0.11));
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      let col = textureSample(u_input_texture, defaultSampler, uv).rgb;
      let dist = distance(uv, u.u_center);
      let vignette = smoothstep(u.u_radius, u.u_radius - 0.1, dist);
      let gray = vec3f(grayScale(col));
      let cag_result = mix(gray, col, clamp(vignette, 0.0, 1.0));
      return vec4f(cag_result, 1.0);
    }
  `,
  getUniforms: () => ({
    u_radius: radiusIn.value,
    u_center: [centerXIn.value, centerYIn.value],
  }),
});
