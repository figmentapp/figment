/**
 * @name Denoise
 * @description Noise reduction filter on input image.
 * @category image
 */

const noiseIn = node.numberIn('denoise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });

const result = figment.createImageFilter(node, {
  label: 'denoise',
  uniforms: { u_texel_size: 'vec2f' },
  wgsl: `
    let uv = in.uv;
    let center = textureSample(u_input_texture, defaultSampler, uv);
    var sum = vec4f(0.0);
    var totalWeight: f32 = 0.0;

    for (var x: f32 = -1.0; x <= 1.0; x += 1.0) {
      for (var y: f32 = -1.0; y <= 1.0; y += 1.0) {
        let offset = vec2f(x, y) * u.u_texel_size;
        let s = textureSample(u_input_texture, defaultSampler, uv + offset);
        let weight = 1.0 / (1.0 + length(s.rgb - center.rgb));
        sum += s * weight;
        totalWeight += weight;
      }
    }

    return sum / totalWeight;
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return {
      u_texel_size: [noiseIn.value / img.width, noiseIn.value / img.height],
    };
  },
});
