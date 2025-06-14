/**
 * @name Vignette
 * @description Vignette  on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform vec2 u_center;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    float dist = distance(uv, u_center);
    float vignette = smoothstep(u_radius, u_radius - 0.1, dist);
    vec4 color = texture2D(u_input_texture, uv);
    color.rgb *= vignette;
    gl_FragColor = color;
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
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
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
