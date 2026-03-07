/**
 * @name Modulate Color
 * @description Change the colors of the input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_red: f32,
  u_green: f32,
  u_blue: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var col = textureSample(u_input_texture, defaultSampler, in.uv);
  col = vec4f(
    clamp(col.r + u.u_red, 0.0, 1.0),
    clamp(col.g + u.u_green, 0.0, 1.0),
    clamp(col.b + u.u_blue, 0.0, 1.0),
    col.a,
  );
  return col;
}
`;

const imageIn = node.imageIn('in');
const redIn = node.numberIn('red', 0, { min: -1, max: 1, step: 0.001 });
const greenIn = node.numberIn('green', 0, { min: -1, max: 1, step: 0.001 });
const blueIn = node.numberIn('blue', 0, { min: -1, max: 1, step: 0.001 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {
      u_red: 'f32',
      u_green: 'f32',
      u_blue: 'f32',
    },
    textures: ['u_input_texture'],
    label: 'modulateColor',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_red: redIn.value,
      u_green: greenIn.value,
      u_blue: blueIn.value,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
