/**
 * @name Mirror
 * @description Mirror the input image over a specific axis.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_resolution: vec2f,
  _pad1: vec2f,
  u_line: vec3f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;
  var uvp = uv * u.u_resolution;
  let d = dot(u.u_line, vec3f(uvp, 1.0));
  if (d > 0.0) {
    uvp.x = uvp.x - 2.0 * u.u_line.x * d;
    uvp.y = uvp.y - 2.0 * u.u_line.y * d;
    uv = uvp / u.u_resolution;
  }
  return textureSample(u_input_texture, defaultSampler, uv);
}
`;

const imageIn = node.imageIn('in');
const pivotXIn = node.numberIn('pivotX', 0.5, { min: 0, max: 1, step: 0.01 });
const pivotYIn = node.numberIn('pivotY', 0.5, { min: 0, max: 1, step: 0.01 });
const angleIn = node.numberIn('angle', 90, { min: -180, max: 180, step: 1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_resolution: 'vec2f', _pad1: 'vec2f', u_line: 'vec3f' },
    textures: ['u_input_texture'],
    label: 'mirror',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  const r = (angleIn.value * Math.PI) / 180;
  const x = Math.sin(r);
  const y = -Math.cos(r);
  const z = -(pivotXIn.value * x * imageIn.value.width + pivotYIn.value * y * imageIn.value.height);

  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    { u_resolution: [imageIn.value.width, imageIn.value.height], u_line: [x, y, z] },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
