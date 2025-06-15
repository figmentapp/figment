/**
 * @name Sepia
 * @description Sepia filter on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_factor;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  vec3 sepia = vec3(1.2, 1.0, 0.8)*u_factor;
  vec3 gray = vec3(dot(color.rgb, vec3(0.299, 0.587, 0.114)));
  vec3 final_color = mix(gray, gray * sepia, 0.5);
  gl_FragColor = vec4(final_color, color.a);
}
`;

const imageIn = node.imageIn('in');
const sepiaIn = node.numberIn('sepia factor', 1.0, { min: 0.0, max: 2.0, step: 0.01 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
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
    u_factor: sepiaIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
