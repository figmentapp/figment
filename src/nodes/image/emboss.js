/**
 * @name Emboss
 * @description Emboss convolution on an input image.
 * @category image
 */

const embossWidthIn = node.numberIn('emboss width', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
const embossHeightIn = node.numberIn('emboss height', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });

figment.createImageFilter(node, {
  label: 'emboss',
  uniforms: { u_emboss: 'vec2f' },
  wgsl: `
    fn sample_pixel(uv: vec2f, dx: f32, dy: f32) -> vec4f {
      return textureSample(u_input_texture, defaultSampler, uv + vec2f(dx, dy));
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      let dx = u.u_emboss.x;
      let dy = u.u_emboss.y;

      var cm: array<vec4f, 9>;
      cm[0] = vec4f(sample_pixel(uv, -dx, -dy).rgb, 0.0);
      cm[1] = vec4f(sample_pixel(uv, -dx, 0.0).rgb, 0.0);
      cm[2] = vec4f(sample_pixel(uv, -dx,  dy).rgb, 0.0);
      cm[3] = vec4f(sample_pixel(uv, 0.0, -dy).rgb, 0.0);
      cm[4] = vec4f(sample_pixel(uv, 0.0, 0.0).rgb, 0.0);
      cm[5] = vec4f(sample_pixel(uv, 0.0,  dy).rgb, 0.0);
      cm[6] = vec4f(sample_pixel(uv,  dx, -dy).rgb, 0.0);
      cm[7] = vec4f(sample_pixel(uv,  dx, 0.0).rgb, 0.0);
      cm[8] = vec4f(sample_pixel(uv,  dx,  dy).rgb, 0.0);

      for (var i = 0; i < 9; i = i + 1) {
        cm[i] = vec4f(cm[i].rgb, (cm[i].r + cm[i].g + cm[i].b) / 3.0);
      }

      let kernel = array<f32, 9>(2.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, -1.0);

      var res: f32 = 0.0;
      for (var i = 0; i < 9; i = i + 1) {
        res = res + kernel[i] * cm[i].w;
      }
      let convolved = clamp(res + 0.5, 0.0, 1.0);

      return vec4f(vec3f(convolved), 1.0);
    }
  `,
  getUniforms: () => ({ u_emboss: [embossWidthIn.value, embossHeightIn.value] }),
});
