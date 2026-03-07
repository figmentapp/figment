/**
 * @name Modulate Color
 * @description Change the colors of the input image.
 * @category image
 */

const redIn = node.numberIn('red', 0, { min: -1, max: 1, step: 0.001 });
const greenIn = node.numberIn('green', 0, { min: -1, max: 1, step: 0.001 });
const blueIn = node.numberIn('blue', 0, { min: -1, max: 1, step: 0.001 });

figment.createImageFilter(node, {
  label: 'modulateColor',
  uniforms: { u_red: 'f32', u_green: 'f32', u_blue: 'f32' },
  wgsl: `
    var col = textureSample(u_input_texture, defaultSampler, in.uv);
    col = vec4f(
      clamp(col.r + u.u_red, 0.0, 1.0),
      clamp(col.g + u.u_green, 0.0, 1.0),
      clamp(col.b + u.u_blue, 0.0, 1.0),
      col.a,
    );
    return col;
  `,
  getUniforms: () => ({
    u_red: redIn.value,
    u_green: greenIn.value,
    u_blue: blueIn.value,
  }),
});
