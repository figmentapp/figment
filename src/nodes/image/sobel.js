/**
 * @name Sobel
 * @description Sobel edge detection on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_resolution: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
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
}
`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_resolution: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'sobel',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    { u_resolution: [imageIn.value.width, imageIn.value.height] },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
