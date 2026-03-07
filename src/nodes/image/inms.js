/**
 * @name INMS
 * @description INMS (Intensity-based Non-Maximum Suppression) edge detection on input image.
 * @category image
 */

const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 0.02, { min: 0.0, max: 0.5, step: 0.001 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });

const result = figment.createImageFilter(node, {
  label: 'inms',
  uniforms: { u_texel_size: 'vec2f', u_increase: 'f32', u_threshold: 'f32' },
  wgsl: `
    let uv = in.uv;

    let center = textureSample(u_input_texture, defaultSampler, uv).r;
    let top = textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, u.u_texel_size.y)).r;
    let bottom = textureSample(u_input_texture, defaultSampler, uv - vec2f(0.0, u.u_texel_size.y)).r;
    let left = textureSample(u_input_texture, defaultSampler, uv - vec2f(u.u_texel_size.x, 0.0)).r;
    let right = textureSample(u_input_texture, defaultSampler, uv + vec2f(u.u_texel_size.x, 0.0)).r;

    let gx = (right - left) / (2.0 * u.u_texel_size.x);
    let gy = (top - bottom) / (2.0 * u.u_texel_size.y);
    let gradientMagnitude = sqrt(gx * gx + gy * gy);

    let gradientDirection = atan2(gy, gx);

    let directionSign = sign(gradientDirection);
    let absDirection = abs(gradientDirection);
    let m = absDirection - floor(absDirection / (0.5 * 3.14159265359)) * (0.5 * 3.14159265359);
    let roundedDirection = directionSign * (absDirection - m + 0.25 * 3.14159265359);

    let magnitude1 = abs(cos(roundedDirection)) * gradientMagnitude * u.u_increase;
    let magnitude2 = abs(sin(roundedDirection)) * gradientMagnitude * u.u_increase;

    let suppressedIntensity = center - 0.5 * (magnitude1 + magnitude2);

    return vec4f(vec3f(step(u.u_threshold, suppressedIntensity)), 1.0);
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
