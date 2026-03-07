/**
 * @name Colorify
 * @description Repaint image in color of choice.
 * @category image
 */

const colorIn = node.colorIn('color', [255, 130, 0, 0.5]);

figment.createImageFilter(node, {
  label: 'colorify',
  uniforms: { u_color: 'vec4f' },
  wgsl: `
    let texel = textureSample(u_input_texture, defaultSampler, in.uv);
    let luma = vec3f(0.299, 0.587, 0.114);
    let v = dot(texel.xyz, luma);
    return vec4f(v * u.u_color.rgb, texel.w);
  `,
  getUniforms: () => ({ u_color: figment.colorToVec4(colorIn.value) }),
});
