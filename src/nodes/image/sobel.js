/**
 * @name Sobel
 * @description Sobel edge detection on input image.
 * @category image
 */

const result = figment.createImageFilter(node, {
  label: 'sobel',
  uniforms: { u_resolution: 'vec2f' },
  wgsl: `
    let uv = in.uv;
    let w = 1.0 / u.u_resolution.x;
    let h = 1.0 / u.u_resolution.y;

    var n: array<vec4f, 9>;
    n[0] = textureSample(u_input_texture, defaultSampler, uv + vec2f(-w, -h));
    n[1] = textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, -h));
    n[2] = textureSample(u_input_texture, defaultSampler, uv + vec2f( w, -h));
    n[3] = textureSample(u_input_texture, defaultSampler, uv + vec2f(-w, 0.0));
    n[4] = textureSample(u_input_texture, defaultSampler, uv);
    n[5] = textureSample(u_input_texture, defaultSampler, uv + vec2f( w, 0.0));
    n[6] = textureSample(u_input_texture, defaultSampler, uv + vec2f(-w,  h));
    n[7] = textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, h));
    n[8] = textureSample(u_input_texture, defaultSampler, uv + vec2f( w,  h));

    let sobel_edge_h = n[2] + (2.0 * n[5]) + n[8] - (n[0] + (2.0 * n[3]) + n[6]);
    let sobel_edge_v = n[0] + (2.0 * n[1]) + n[2] - (n[6] + (2.0 * n[7]) + n[8]);
    let sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));

    return vec4f(1.0 - sobel.rgb, 1.0);
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return { u_resolution: [img.width, img.height] };
  },
});
