/**
 * @name Glitch
 * @description Glitches on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_randomSeed: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;

  // Add random noise to the UV coordinates
  let noise = fract(sin(dot(uv + u.u_randomSeed, vec2f(12.9898, 78.233)) * 43758.5453));
  uv += (noise - 0.5) * 0.2;

  // Sample the texture at the modified UV coordinates
  var color = textureSample(u_input_texture, defaultSampler, uv);

  // Apply a color shift effect based on the x and y coordinates
  let shiftX = sin(uv.x * 0.01 + u.u_randomSeed) * 0.1;
  let shiftY = sin(uv.y * 0.01 + u.u_randomSeed) * 0.1;
  color.r = textureSample(u_input_texture, defaultSampler, vec2f(uv.x + shiftX, uv.y + shiftY)).r;
  color.g = textureSample(u_input_texture, defaultSampler, vec2f(uv.x - shiftX, uv.y - shiftY)).g;
  color.b = textureSample(u_input_texture, defaultSampler, vec2f(uv.x + shiftY, uv.y - shiftX)).b;

  return color;
}
`;

const imageIn = node.imageIn('in');
const seedIn = node.numberIn('seed', 50.0, { min: 0.0, max: 1000.0, step: 1.0 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_randomSeed: 'f32' },
    textures: ['u_input_texture'],
    label: 'glitch',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_randomSeed: seedIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
