/**
 * @name Vignette
 * @description Darkens or tints the edges of the image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_softness;
uniform vec3 u_color;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    float dist = distance(uv, u_center);
    float vignette = smoothstep(u_radius, u_radius - u_softness, dist);
    vignette = mix(1.0, vignette, u_strength);
    vec4 color = texture2D(u_input_texture, uv);
    color.rgb = mix(u_color, color.rgb, vignette);
    gl_FragColor = color;
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const strengthIn = node.numberIn('strength', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const softnessIn = node.numberIn('softness', 0.1, { min: 0.01, max: 1.0, step: 0.01 });
const colorIn = node.colorIn('color', [0, 0, 0, 1.0]);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_radius: radiusIn.value,
    u_center: [centerXIn.value, centerYIn.value],
    u_strength: strengthIn.value,
    u_softness: softnessIn.value,
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
