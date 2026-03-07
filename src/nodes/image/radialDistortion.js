/**
 * @name Radial Distortion
 * @description Radial distortion on image.
 * @category image
 */

const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const rotate = node.numberIn('rotate', 1.0, { min: 0.0, max: 25.0, step: 0.1 });

figment.createImageFilter(node, {
  label: 'radialDistortion',
  uniforms: { u_distortion: 'f32', u_time: 'f32' },
  wgsl: `
    var uv = in.uv - 0.5;
    var radius = length(uv);
    let angle = atan2(uv.y, uv.x);
    radius += cos(angle * 4.0 + u.u_time) * u.u_distortion;
    uv = radius * vec2f(cos(angle), sin(angle));
    uv += 0.5;
    return textureSample(u_input_texture, defaultSampler, uv);
  `,
  getUniforms: () => ({ u_distortion: dist.value, u_time: rotate.value }),
});
