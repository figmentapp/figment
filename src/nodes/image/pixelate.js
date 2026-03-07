/**
 * @name Pixelate
 * @description Pixelate input image (Mosaic effect).
 * @category image
 */

const cellSize = node.numberIn('cell size', 32, { min: 1, max: 200, step: 1 });

const result = figment.createImageFilter(node, {
  label: 'pixelate',
  uniforms: { u_cell_size: 'f32', u_resolution: 'vec2f' },
  wgsl: `
    let cells = u.u_resolution / u.u_cell_size;
    let cell_uv = floor(in.uv * cells) / cells;
    let color = textureSample(u_input_texture, defaultSampler, cell_uv).rgb;
    return vec4f(color, 1.0);
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return { u_cell_size: cellSize.value, u_resolution: [img.width, img.height] };
  },
});
