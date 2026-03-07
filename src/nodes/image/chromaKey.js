/**
 * @name Chroma Key
 * @description Make pixels of a certain color transparent, like green screen effect.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_keyColor: vec3f,
  u_threshold: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(u_input_texture, defaultSampler, in.uv);

  // calculate the color difference between the current pixel and the key color
  let difference = length(color.rgb - u.u_keyColor);

  // if the difference is less than the threshold, set the alpha to 0
  if (difference < u.u_threshold) {
    color.a = 0.0;
  }

  return color;
}
`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('key color', [0, 255, 0]);
const thresholdIn = node.numberIn('threshold', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_keyColor: 'vec3f', u_threshold: 'f32' },
    textures: ['u_input_texture'],
    label: 'chromaKey',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_keyColor: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
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
