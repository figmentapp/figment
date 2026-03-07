/**
 * @name Vignette
 * @description Darkens or tints the edges of the image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_radius: f32,
  u_strength: f32,
  u_softness: f32,
  _pad: f32,
  u_center: vec2f,
  _pad2: vec2f,
  u_color: vec3f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let d = abs(uv - u.u_center);
  let dist = pow(pow(d.x, 4.0) + pow(d.y, 4.0), 0.25);
  let vignette_raw = 1.0 - smoothstep(u.u_radius * (1.0 - u.u_softness), u.u_radius, dist);
  let vignette = mix(1.0, vignette_raw, u.u_strength);
  let color = textureSample(u_input_texture, defaultSampler, uv);
  let result = mix(u.u_color, color.rgb, vec3f(vignette));
  return vec4f(result, color.a);
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const strengthIn = node.numberIn('strength', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const softnessIn = node.numberIn('softness', 0.25, { min: 0.01, max: 1.0, step: 0.01 });
const colorIn = node.colorIn('color', [0, 0, 0, 1.0]);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {
      u_radius: 'f32',
      u_strength: 'f32',
      u_softness: 'f32',
      u_center: 'vec2f',
      u_color: 'vec3f',
    },
    textures: ['u_input_texture'],
    label: 'vignette',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_radius: radiusIn.value,
      u_center: [centerXIn.value, centerYIn.value],
      u_strength: strengthIn.value,
      u_softness: softnessIn.value,
      u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
