/**
 * @name Mask Image
 * @description Mask the input image with another image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_source_texture;
uniform sampler2D u_mask_texture;
uniform int u_mask_method;
varying vec2 v_uv;

void main() {
  vec4 input_color = texture2D(u_source_texture, v_uv);
  vec4 mask_color = texture2D(u_mask_texture, v_uv);
  if (u_mask_method == 1) {
    // Mask method 1: use the color component of the image.
    gl_FragColor = vec4(input_color.r, input_color.g, input_color.b, input_color.a * mask_color.r);
  } else if (u_mask_method == 2) {
    // Mask method 2: use the alpha component of the mask image.
    gl_FragColor = vec4(input_color.r, input_color.g, input_color.b, input_color.a * mask_color.a);
  }
}
`;

const sourceIn = node.imageIn('source');
const maskIn = node.imageIn('mask');
const maskMethodIn = node.selectIn('maskMethod', ['white', 'alpha']);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!sourceIn.value) return;
  if (!maskIn.value) {
    imageOut.set(sourceIn.value);
    return;
  }
  framebuffer.setSize(sourceIn.value.width, sourceIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_source_texture: sourceIn.value.texture,
    u_mask_texture: maskIn.value.texture,
    u_mask_method: maskMethodIn.value === 'white' ? 1 : 2,
    u_resolution: [sourceIn.value.width, sourceIn.value.height],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
