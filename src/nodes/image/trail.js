/**
 * @name Trail
 * @description Don't erase the previous input image, creating a trail.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_fade: f32,
  u_seed: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_prev_texture: texture_2d<f32>;
@group(0) @binding(3) var u_new_texture: texture_2d<f32>;

fn random(st: vec2f) -> f32 {
  return fract(sin(dot(st, vec2f(12.9898, 78.233))) * 43758.5453123);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var prev = textureSample(u_prev_texture, defaultSampler, in.uv);
  let next = textureSample(u_new_texture, defaultSampler, in.uv);

  // Monte Carlo fading: each pixel has probability 'fade' of being cleared
  // Use pow curve so low values give very slow fades
  let fade = pow(u.u_fade, 4.0);
  let noise = random(in.uv + u.u_seed);

  if (noise < fade) {
    prev = vec4f(0.0); // Clear this pixel
  }

  // Standard alpha blending: next over prev
  let outA = next.a + prev.a * (1.0 - next.a);
  var outRGB = vec3f(0.0);
  if (outA > 0.0) {
    outRGB = (next.rgb * next.a + prev.rgb * prev.a * (1.0 - next.a)) / outA;
  }

  return vec4f(outRGB, outA);
}
`;

const imageIn = node.imageIn('in');
const fadeParam = node.numberIn('fade', 0, { min: 0, max: 1, step: 0.01 });
const clearButtonIn = node.triggerButtonIn('clear');
const imageOut = node.imageOut('out');

let pipeline;
let pp;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_fade: 'f32', u_seed: 'f32' },
    textures: ['u_prev_texture', 'u_new_texture'],
    label: 'trail',
  });
  pp = new figment.PingPongTarget();
};

node.onRender = () => {
  const input = imageIn.value;
  if (!input) return;

  const w = input.width;
  const h = input.height;

  pp.setSize(w, h);

  figment.drawFullscreen(
    pipeline,
    { u_fade: fadeParam.value, u_seed: Math.random() },
    { u_prev_texture: pp.read, u_new_texture: input },
    pp.write,
  );
  pp.swap();

  imageOut.set(pp.read);
};

node.onStop = () => {
  pp?.destroy();
};

clearButtonIn.onTrigger = () => {
  // Re-create to clear both buffers
  if (pp) {
    pp.destroy();
    pp = new figment.PingPongTarget();
  }
};
