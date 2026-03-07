/**
 * @name LoG Edges
 * @description Laplacian of Gaussian (LoG) edge detection on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_texel_size: vec2f,
  u_increase: f32,
  u_threshold: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;

  // Create a 5x5 kernel for LoG
  var kernel = array<f32, 25>(
    0.003765, 0.015019, 0.023792, 0.015019, 0.003765,
    0.015019, 0.059912, 0.094907, 0.059912, 0.015019,
    0.023792, 0.094907, 0.150342, 0.094907, 0.023792,
    0.015019, 0.059912, 0.094907, 0.059912, 0.015019,
    0.003765, 0.015019, 0.023792, 0.015019, 0.003765
  );

  // Normalize the kernel
  var sum: f32 = 0.0;
  for (var i: i32 = 0; i < 25; i++) {
    sum += kernel[i];
  }
  for (var i: i32 = 0; i < 25; i++) {
    kernel[i] /= sum;
  }

  // Compute the LoG filter by convolving the image with the kernel
  var edge: f32 = 0.0;
  for (var i: i32 = -2; i <= 2; i++) {
    for (var j: i32 = -2; j <= 2; j++) {
      let offset = vec2f(f32(i), f32(j)) * u.u_texel_size;
      let intensity = textureSample(u_input_texture, defaultSampler, uv + offset).r;
      edge += intensity * kernel[(i + 2) * 5 + (j + 2)];
    }
  }
  edge *= u.u_increase;

  return vec4f(step(u.u_threshold, edge), edge, edge, 1.0);
}
`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_texel_size: 'vec2f', u_increase: 'f32', u_threshold: 'f32' },
    textures: ['u_input_texture'],
    label: 'logEdges',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_texel_size: [blurIn.value / imageIn.value.width, blurIn.value / imageIn.value.height],
      u_increase: increaseIn.value,
      u_threshold: thresholdIn.value,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
