/**
 * @name Glitch
 * @description Glitches on input image.
 * @category image
 */

const seedIn = node.numberIn('seed', 50.0, { min: 0.0, max: 1000.0, step: 1.0 });

figment.createImageFilter(node, {
  label: 'glitch',
  uniforms: { u_randomSeed: 'f32' },
  wgsl: `
    var uv = in.uv;

    let noise = fract(sin(dot(uv + u.u_randomSeed, vec2f(12.9898, 78.233)) * 43758.5453));
    uv += (noise - 0.5) * 0.2;

    var color = textureSample(u_input_texture, defaultSampler, uv);

    let shiftX = sin(uv.x * 0.01 + u.u_randomSeed) * 0.1;
    let shiftY = sin(uv.y * 0.01 + u.u_randomSeed) * 0.1;
    color.r = textureSample(u_input_texture, defaultSampler, vec2f(uv.x + shiftX, uv.y + shiftY)).r;
    color.g = textureSample(u_input_texture, defaultSampler, vec2f(uv.x - shiftX, uv.y - shiftY)).g;
    color.b = textureSample(u_input_texture, defaultSampler, vec2f(uv.x + shiftY, uv.y - shiftX)).b;

    return color;
  `,
  getUniforms: () => ({ u_randomSeed: seedIn.value }),
});
