/**
 * @name Denoise
 * @description Noise reduction filter on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_texel_size: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let center = textureSample(u_input_texture, defaultSampler, uv);
  var sum = vec4f(0.0);
  var totalWeight: f32 = 0.0;

  for (var x: f32 = -1.0; x <= 1.0; x += 1.0) {
    for (var y: f32 = -1.0; y <= 1.0; y += 1.0) {
      let offset = vec2f(x, y) * u.u_texel_size;
      let s = textureSample(u_input_texture, defaultSampler, uv + offset);
      let weight = 1.0 / (1.0 + length(s.rgb - center.rgb));
      sum += s * weight;
      totalWeight += weight;
    }
  }

  return sum / totalWeight;
}
`;

const imageIn = node.imageIn('in');
const noiseIn = node.numberIn('denoise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_texel_size: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'denoise',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_texel_size: [noiseIn.value / imageIn.value.width, noiseIn.value / imageIn.value.height],
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
