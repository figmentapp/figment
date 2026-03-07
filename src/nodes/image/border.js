/**
 * @name Border
 * @description Generate a border around the image.
 * @category image
 */

const borderSize = node.numberIn('borderSize', 10.0, { min: 1, max: 512, step: 1 });
const borderColor = node.colorIn('borderColor', [255, 255, 255, 1.0]);

const result = figment.createImageFilter(node, {
  label: 'border',
  uniforms: { u_border_color: 'vec4f', u_resolution: 'vec2f', u_border_size: 'f32' },
  wgsl: `
    let border_frac = u.u_border_size / u.u_resolution.x;
    if (in.uv.x < border_frac || in.uv.x > 1.0 - border_frac || in.uv.y < border_frac || in.uv.y > 1.0 - border_frac) {
      return u.u_border_color;
    }
    return textureSampleLevel(u_input_texture, defaultSampler, in.uv, 0.0);
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return {
      u_border_color: figment.colorToVec4(borderColor.value),
      u_resolution: [img.width, img.height],
      u_border_size: borderSize.value,
    };
  },
});
