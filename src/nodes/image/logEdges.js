/**
 * @name LoG Edges
 * @description Laplacian of Gaussian (LoG) edge detection on input image.
 * @category image
 */

const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });

const result = figment.createImageFilter(node, {
  label: 'logEdges',
  uniforms: { u_texel_size: 'vec2f', u_increase: 'f32', u_threshold: 'f32' },
  wgsl: `
    let uv = in.uv;

    var kernel = array<f32, 25>(
      0.003765, 0.015019, 0.023792, 0.015019, 0.003765,
      0.015019, 0.059912, 0.094907, 0.059912, 0.015019,
      0.023792, 0.094907, 0.150342, 0.094907, 0.023792,
      0.015019, 0.059912, 0.094907, 0.059912, 0.015019,
      0.003765, 0.015019, 0.023792, 0.015019, 0.003765
    );

    var sum: f32 = 0.0;
    for (var i: i32 = 0; i < 25; i++) {
      sum += kernel[i];
    }
    for (var i: i32 = 0; i < 25; i++) {
      kernel[i] /= sum;
    }

    var edge: f32 = 0.0;
    for (var i: i32 = -2; i <= 2; i++) {
      for (var j: i32 = -2; j <= 2; j++) {
        let offset = vec2f(f32(i), f32(j)) * u.u_texel_size;
        let intensity = textureSample(u_input_texture, defaultSampler, uv + offset).r;
        edge += intensity * kernel[(i + 2) * 5 + (j + 2)];
      }
    }
    edge *= u.u_increase;

    return vec4f(step(u.u_threshold, edge), edge, edge, 1.0);
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return {
      u_texel_size: [blurIn.value / img.width, blurIn.value / img.height],
      u_increase: increaseIn.value,
      u_threshold: thresholdIn.value,
    };
  },
});
