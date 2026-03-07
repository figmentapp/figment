/**
 * @name Transform
 * @description Translate/rotate/scale the image.
 * @category image
 */

const translateXIn = node.numberIn('translateX', 0, { min: -2, max: 2, step: 0.01 });
const translateYIn = node.numberIn('translateY', 0, { min: -2, max: 2, step: 0.01 });
const scaleXIn = node.numberIn('scaleX', 1, { min: -10, max: 10, step: 0.01 });
const scaleYIn = node.numberIn('scaleY', 1, { min: -10, max: 10, step: 0.01 });
const rotateIn = node.numberIn('rotate', 0.0, { min: -360, max: 360, step: 1 });

figment.createImageFilter(node, {
  label: 'transform',
  uniforms: { u_transform: 'mat4x4f' },
  wgsl: `
    // Convert UV to clip space, apply inverse transform, convert back to UV
    let clipPos = vec4f(in.uv * 2.0 - 1.0, 0.0, 1.0);
    let transformed = u.u_transform * clipPos;
    let uv = transformed.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return vec4f(0.0, 0.0, 0.0, 0.0);
    }
    return textureSampleLevel(u_input_texture, defaultSampler, uv, 0.0);
  `,
  getUniforms: () => {
    const angle = (-rotateIn.value * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const sx = 1.0 / scaleXIn.value;
    const sy = 1.0 / scaleYIn.value;
    const tx = -translateXIn.value;
    const ty = -translateYIn.value;

    // Column-major mat4x4: translate(-tx,-ty) * rotate(-angle) * scale(1/sx, 1/sy)
    const u_transform = [
      sx * cosA,
      sx * sinA,
      0,
      0,
      -sy * sinA,
      sy * cosA,
      0,
      0,
      0,
      0,
      1,
      0,
      tx * sx * cosA - ty * sy * sinA,
      tx * sx * sinA + ty * sy * cosA,
      0,
      1,
    ];

    return { u_transform };
  },
});
