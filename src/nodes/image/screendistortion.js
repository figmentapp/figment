/**
 * @name Screen Distortion
 * @description Simple distortion on image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_distortion: f32,
  u_lines: f32,
  u_resolution: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn sawtooth(t: f32) -> f32 {
  return abs(((abs(t)) % 2.0) - 1.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;
  let distpow = (1.2 - u.u_distortion) * 10.0;

  let ctr = vec2f(0.5, 0.5);
  var ctrvec = ctr - uv;
  let ctrdist = length(ctrvec);
  ctrvec /= ctrdist;
  uv += ctrvec * max(0.0, pow(ctrdist, distpow) - 0.0025);

  let div = 40.0 * vec2f(1.0, u.u_resolution.y / u.u_resolution.x);
  var lines = 0.0;
  lines += smoothstep(0.2, 0.0, sawtooth(uv.x * 2.0 * div.x));
  lines += smoothstep(0.2, 0.0, sawtooth(uv.y * 2.0 * div.y));
  lines = clamp(lines, 0.0, 1.0);
  var outcol = textureSample(u_input_texture, defaultSampler, uv).rgb;
  if (u.u_lines == 1.0) {
    outcol *= vec3f(1.0 - lines);
  }

  let valid = step(vec2f(0.0), uv) * step(uv, vec2f(1.0));
  outcol *= valid.x * valid.y;
  return vec4f(outcol, 1.0);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: 0.0, max: 1.5, step: 0.01 });
const linesIn = node.selectIn('Lines', ['On', 'Off']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_distortion: 'f32', u_lines: 'f32', u_resolution: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'screenDistortion',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  let u_lines;
  if (linesIn.value === 'On') {
    u_lines = 1.0;
  } else {
    u_lines = 0.0;
  }
  figment.drawFullscreen(
    pipeline,
    {
      u_distortion: dist.value,
      u_lines,
      u_resolution: [imageIn.value.width, imageIn.value.height],
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
