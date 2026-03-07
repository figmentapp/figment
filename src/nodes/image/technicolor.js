/**
 * @name Technicolor
 * @description Simulates the look of the two-strip technicolor process popular in early 20th century films.
 * @category image
 */

// http://www.widescreenmuseum.com/oldcolor/technicolor1.htm

figment.createImageFilter(node, {
  label: 'technicolor',
  wgsl: `
    let tex = textureSample(u_input_texture, defaultSampler, in.uv);
    return vec4f(tex.r, (tex.g + tex.b) * 0.5, (tex.g + tex.b) * 0.5, 1.0);
  `,
});
