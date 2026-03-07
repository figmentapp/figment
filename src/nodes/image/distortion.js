/**
 * @name Distortion
 * @description Simple distortion on image.
 * @category image
 */

const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const wave = node.numberIn('wave', 1.0, { min: 0.0, max: 10.0, step: 0.1 });

figment.createImageFilter(node, {
  label: 'distortion',
  uniforms: { u_distortion: 'f32', u_time: 'f32' },
  wgsl: `
    var uv = in.uv;
    let X = uv.x * 6.0 + u.u_time;
    let Y = uv.y * 6.0 + u.u_time;
    uv.x += cos(X + Y) * u.u_distortion * cos(Y);
    uv.y += sin(X + Y) * u.u_distortion * sin(Y);
    return textureSample(u_input_texture, defaultSampler, uv);
  `,
  getUniforms: () => ({ u_distortion: dist.value, u_time: wave.value }),
});
