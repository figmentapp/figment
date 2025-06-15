/**
 * @name Solarize
 * @description Solarize filter on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);
    vec3 solarized_color = clamp(color.rgb, 0.0, 1.0);
    solarized_color = mix(solarized_color, 1.0 - solarized_color, step(u_threshold, solarized_color));
    gl_FragColor = vec4(solarized_color, color.a);
}
`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.0, { min: 0.0, max: 1.5, step: 0.01 });
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
    u_threshold: thresholdIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
