/**
 * @name Glow Edges
 * @description Computes glowing edges on input image.
 * @category image
 */

const colorIn = node.colorIn('edge color', [0, 255, 0, 1.0]);
const strokeIn = node.numberIn('stroke width', 1.0, { min: 0.0, max: 5.0, step: 0.1 });

const result = figment.createImageFilter(node, {
  label: 'glowEdges',
  uniforms: { u_resolution: 'vec2f', u_stroke: 'f32', u_color: 'vec4f' },
  wgsl: `
    fn make_kernel(coord: vec2f) -> array<vec4f, 9> {
      let w = u.u_stroke / u.u_resolution.x;
      let h = u.u_stroke / u.u_resolution.y;

      var n: array<vec4f, 9>;
      n[0] = textureSample(u_input_texture, defaultSampler, coord + vec2f(-w, -h));
      n[1] = textureSample(u_input_texture, defaultSampler, coord + vec2f(0.0, -h));
      n[2] = textureSample(u_input_texture, defaultSampler, coord + vec2f(w, -h));
      n[3] = textureSample(u_input_texture, defaultSampler, coord + vec2f(-w, 0.0));
      n[4] = textureSample(u_input_texture, defaultSampler, coord);
      n[5] = textureSample(u_input_texture, defaultSampler, coord + vec2f(w, 0.0));
      n[6] = textureSample(u_input_texture, defaultSampler, coord + vec2f(-w, h));
      n[7] = textureSample(u_input_texture, defaultSampler, coord + vec2f(0.0, h));
      n[8] = textureSample(u_input_texture, defaultSampler, coord + vec2f(w, h));
      return n;
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      let n = make_kernel(uv);

      let sobel_edge_h = n[2] + (2.0 * n[5]) + n[8] - (n[0] + (2.0 * n[3]) + n[6]);
      let sobel_edge_v = n[0] + (2.0 * n[1]) + n[2] - (n[6] + (2.0 * n[7]) + n[8]);

      let r = (sobel_edge_h.r * sobel_edge_h.r + sobel_edge_v.r * sobel_edge_v.r) * u.u_color.r;
      let g = (sobel_edge_h.g * sobel_edge_h.g + sobel_edge_v.g * sobel_edge_v.g) * u.u_color.g;
      let b = (sobel_edge_h.b * sobel_edge_h.b + sobel_edge_v.b * sobel_edge_v.b) * u.u_color.b;

      var col = textureSample(u_input_texture, defaultSampler, uv);
      col = col + vec4f(r, g, b, 1.0);
      return col;
    }
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return {
      u_resolution: [img.width, img.height],
      u_stroke: strokeIn.value,
      u_color: figment.colorToVec4(colorIn.value),
    };
  },
});
