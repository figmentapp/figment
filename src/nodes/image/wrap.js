/**
 * @name Wrap
 * @description Circular wrap of input image.
 * @category image
 */

const radiusIn = node.numberIn('radius', 2.0, { min: 0, max: 5, step: 0.01 });
const twistIn = node.numberIn('twist', 0.0, { min: -1, max: 1, step: 0.01 });

figment.createImageFilter(node, {
  label: 'wrap',
  uniforms: { u_radius: 'f32', u_twist: 'f32' },
  wgsl: `
    var uv = in.uv;
    var p = -1.0 + 2.0 * uv;
    let r = sqrt(dot(p, p));

    p.x = (p.x + r * u.u_twist) - floor(p.x + r * u.u_twist);
    let a = atan2(p.y, p.x);

    uv.x = (a + 3.14159265359) / 6.28318530718;
    uv.y = r / sqrt(u.u_radius);
    let col = textureSample(u_input_texture, defaultSampler, uv).rgb;
    return vec4f(col, 1.0);
  `,
  getUniforms: () => ({ u_radius: radiusIn.value, u_twist: twistIn.value }),
});
