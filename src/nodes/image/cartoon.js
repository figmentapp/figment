/**
 * @name Cartoon
 * @description Render cartoon like image.
 * @category image
 */

// demo: https://www.shadertoy.com/view/MslfWj // Ruofei Du

const num = node.numberIn('amount', 3.0, { min: 2.0, max: 8.0, step: 0.1 });

figment.createImageFilter(node, {
  label: 'cartoon',
  uniforms: { u_num: 'f32' },
  wgsl: `
    const rgb2yuv_mat = mat3x3f(
      vec3f(0.2126, -0.09991, 0.615),
      vec3f(0.7152, -0.33609, -0.55861),
      vec3f(0.0722, 0.436, -0.05639)
    );

    const yuv2rgb_mat = mat3x3f(
      vec3f(1.0, 1.0, 1.0),
      vec3f(0.0, -0.21482, 2.12798),
      vec3f(1.28033, -0.38059, 0.0)
    );

    fn rgb2yuv(rgb: vec3f) -> vec3f {
      return rgb2yuv_mat * rgb;
    }

    fn yuv2rgb(yuv: vec3f) -> vec3f {
      return yuv2rgb_mat * yuv;
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      let color = textureSample(u_input_texture, defaultSampler, uv);
      let yuv = rgb2yuv(color.rgb);
      let rgb = yuv2rgb(vec3f(floor(yuv.x * u.u_num) / u.u_num, yuv.y, yuv.z));
      return vec4f(rgb, 1.0);
    }
  `,
  getUniforms: () => ({ u_num: num.value }),
});
