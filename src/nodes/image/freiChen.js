/**
 * @name Freichen
 * @description Freichen edges shader
 * @category image
 */

const FRAGMENT_WGSL = `
// Edge Detection Shader using Frei-Chen filter
// Based on http://rastergrid.com/blog/2011/01/frei-chen-edge-detector
struct Uniforms {
  u_resolution: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

const g0 = mat3x3f(vec3f(0.3535533845424652, 0.5, 0.3535533845424652), vec3f(0.0, 0.0, 0.0), vec3f(-0.3535533845424652, -0.5, -0.3535533845424652));
const g1 = mat3x3f(vec3f(0.3535533845424652, 0.0, -0.3535533845424652), vec3f(0.5, 0.0, -0.5), vec3f(0.3535533845424652, 0.0, -0.3535533845424652));
const g2 = mat3x3f(vec3f(0.0, -0.3535533845424652, 0.5), vec3f(0.3535533845424652, 0.0, -0.3535533845424652), vec3f(-0.5, 0.3535533845424652, 0.0));
const g3 = mat3x3f(vec3f(0.5, -0.3535533845424652, 0.0), vec3f(-0.3535533845424652, 0.0, 0.3535533845424652), vec3f(0.0, 0.3535533845424652, -0.5));
const g4 = mat3x3f(vec3f(0.0, 0.5, 0.0), vec3f(-0.5, 0.0, -0.5), vec3f(0.0, 0.5, 0.0));
const g5 = mat3x3f(vec3f(-0.5, 0.0, 0.5), vec3f(0.0, 0.0, 0.0), vec3f(0.5, 0.0, -0.5));
const g6 = mat3x3f(vec3f(0.1666666716337204, -0.3333333432674408, 0.1666666716337204), vec3f(-0.3333333432674408, 0.6666666865348816, -0.3333333432674408), vec3f(0.1666666716337204, -0.3333333432674408, 0.1666666716337204));
const g7 = mat3x3f(vec3f(-0.3333333432674408, 0.1666666716337204, -0.3333333432674408), vec3f(0.1666666716337204, 0.6666666865348816, 0.1666666716337204), vec3f(-0.3333333432674408, 0.1666666716337204, -0.3333333432674408));
const g8 = mat3x3f(vec3f(0.3333333432674408, 0.3333333432674408, 0.3333333432674408), vec3f(0.3333333432674408, 0.3333333432674408, 0.3333333432674408), vec3f(0.3333333432674408, 0.3333333432674408, 0.3333333432674408));

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let texel = vec2f(1.0 / u.u_resolution.x, 1.0 / u.u_resolution.y);

  var G: array<mat3x3f, 9>;
  G[0] = g0;
  G[1] = g1;
  G[2] = g2;
  G[3] = g3;
  G[4] = g4;
  G[5] = g5;
  G[6] = g6;
  G[7] = g7;
  G[8] = g8;

  var I: mat3x3f;

  // fetch the 3x3 neighbourhood and use the RGB vector's length as intensity value
  for (var i: i32 = 0; i < 3; i++) {
    for (var j: i32 = 0; j < 3; j++) {
      let s = textureSample(u_input_texture, defaultSampler, uv + texel * vec2f(f32(i) - 1.0, f32(j) - 1.0)).rgb;
      I[i][j] = length(s);
    }
  }

  // calculate the convolution values for all the masks
  var cnv: array<f32, 9>;
  for (var i: i32 = 0; i < 9; i++) {
    let dp3 = dot(G[i][0], I[0]) + dot(G[i][1], I[1]) + dot(G[i][2], I[2]);
    cnv[i] = dp3 * dp3;
  }

  let M = (cnv[0] + cnv[1]) + (cnv[2] + cnv[3]);
  let S = (cnv[4] + cnv[5]) + (cnv[6] + cnv[7]) + (cnv[8] + M);

  return vec4f(vec3f(sqrt(M / S)), 1.0);
}
`;

const imageIn = node.imageIn('in');
const resolutionIn = node.numberIn('resolution', 512, { min: 4, max: 2048, step: 1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_resolution: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'freiChen',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_resolution: [resolutionIn.value, resolutionIn.value] }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
