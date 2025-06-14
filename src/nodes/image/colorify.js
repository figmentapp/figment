/**
 * @name Colorify
 * @description Repaint image in color of choice.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec4 u_color;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;

  vec4 texel = texture2D( u_input_texture, uv );

  vec3 luma = vec3( 0.299, 0.587, 0.114 );
  float v = dot( texel.xyz, luma );

  gl_FragColor = vec4( v * u_color.rgb, texel.w );

}
`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('color', [255, 130, 0, 0.5]);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  const color = colorIn.value;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_color: [color[0] / 255, color[1] / 255, color[2] / 255, color[3]],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
