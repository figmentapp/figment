/**
 * @name Bleach Bypass
 * @description Bleach bypass shader
 * @category image
 */

const opacityIn = node.numberIn('opacity', 1.0, { min: 0.0, max: 2.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'bleachBypass',
  uniforms: { u_opacity: 'f32' },
  wgsl: `
    let base = textureSample(u_input_texture, defaultSampler, in.uv);

    let lumCoeff = vec3f(0.25, 0.65, 0.1);
    let lum = dot(lumCoeff, base.rgb);
    let blend = vec3f(lum);
    let L = min(1.0, max(0.0, 10.0 * (lum - 0.45)));

    let result1 = 2.0 * base.rgb * blend;
    let result2 = 1.0 - 2.0 * (1.0 - blend) * (1.0 - base.rgb);

    let newColor = mix(result1, result2, vec3f(L));
    let A2 = u.u_opacity * base.a;
    var mixRGB = A2 * newColor.rgb;
    mixRGB = mixRGB + ((1.0 - A2) * base.rgb);
    return vec4f(mixRGB, base.a);
  `,
  getUniforms: () => ({ u_opacity: opacityIn.value }),
});
