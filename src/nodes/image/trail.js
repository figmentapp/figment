/**
 * @name Trail
 * @description Don't erase the previous input image, creating a trail.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_prev_texture;
uniform sampler2D u_new_texture;
uniform float u_fade;
uniform float u_mix;
uniform float u_seed;
varying vec2 v_uv;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  vec4 prev = texture2D(u_prev_texture, v_uv);
  vec4 next = texture2D(u_new_texture, v_uv);

  // Use a curve that allows for very slow fades
  float fade = pow(u_fade, 4.0);
  prev *= (1.0 - fade);

  // Apply mix to new image
  next.a *= u_mix;

  // Standard alpha blending: next over prev
  float outA = next.a + prev.a * (1.0 - next.a);
  vec3 outRGB = vec3(0.0);
  if (outA > 0.0) {
    outRGB = (next.rgb * next.a + prev.rgb * prev.a * (1.0 - next.a)) / outA;
  }
  
  vec4 result = vec4(outRGB, outA);

  // Dithering to handle sub-bit precision for slow fades
  float noise = random(v_uv + u_seed);
  result += (noise - 0.5) / 255.0;

  gl_FragColor = result;
}
`;

const imageIn = node.imageIn('in');
const mixParam = node.numberIn('mix', 1, { min: 0, max: 1, step: 0.01 });
const fadeParam = node.numberIn('fade', 0, { min: 0, max: 1, step: 0.01 });
const clearButtonIn = node.triggerButtonIn('clear');
const imageOut = node.imageOut('out');

let program;
let ping, pong;
let current;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  ping = new figment.Framebuffer();
  pong = new figment.Framebuffer();
  current = ping;
};

node.onRender = () => {
  const input = imageIn.value;
  if (!input) return;

  const w = input.width;
  const h = input.height;

  if (ping.width !== w || ping.height !== h) {
    ping.setSize(w, h);
    pong.setSize(w, h);

    // Clear buffers on resize
    ping.bind();
    figment.clear();
    ping.unbind();
    pong.bind();
    figment.clear();
    pong.unbind();

    current = ping;
  }

  const next = current === ping ? pong : ping;

  next.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_prev_texture: current.texture,
    u_new_texture: input.texture,
    u_fade: fadeParam.value * 0.6,
    u_mix: mixParam.value,
    u_seed: Math.random(),
  });
  next.unbind();

  current = next;
  imageOut.set(current);
};

function clear() {
  ping.bind();
  figment.clear();
  ping.unbind();
  pong.bind();
  figment.clear();
  pong.unbind();
  imageOut.set(current);
}

clearButtonIn.onTrigger = clear;
