/**
 * @name Kaleidoscope
 * @description Radial reflection around center point of image.
 * @category image
 */

const angleIn = node.numberIn('angle', 0.0, { min: 0.0, max: 6.3, step: 0.01 });
const sidesIn = node.numberIn('sides', 6.0, { min: 0.0, max: 35.0, step: 1.0 });

figment.createImageFilter(node, {
  label: 'kaleidoscope',
  uniforms: { u_sides: 'f32', u_angle: 'f32' },
  wgsl: `
    let p_in = in.uv - 0.5;
    let r = length(p_in);
    var a = atan2(p_in.y, p_in.x) + u.u_angle;
    let tau = 2.0 * 3.1416;
    let sector = tau / u.u_sides;
    a = a - floor(a / sector) * sector;
    a = abs(a - sector / 2.0);
    let p = r * vec2f(cos(a), sin(a));
    let color = textureSample(u_input_texture, defaultSampler, p + 0.5);
    return color;
  `,
  getUniforms: () => ({ u_sides: sidesIn.value, u_angle: angleIn.value }),
});
