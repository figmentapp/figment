/**
 * @name Glow Edges
 * @description Computes glowing edges on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_resolution: vec2f,
  u_stroke: f32,
  _pad1: f32,
  u_color: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

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
`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('edge color', [0, 255, 0, 1.0]);
const strokeIn = node.numberIn('stroke width', 1.0, { min: 0.0, max: 5.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_resolution: 'vec2f', u_stroke: 'f32', _pad1: 'f32', u_color: 'vec4f' },
    textures: ['u_input_texture'],
    label: 'glowEdges',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_resolution: [imageIn.value.width, imageIn.value.height],
      u_stroke: strokeIn.value,
      u_color: figment.colorToVec4(colorIn.value),
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
