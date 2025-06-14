/**
 * @name Mirror
 * @description Mirror the input image over a specific axis.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec3 u_line;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv;
  vec2 uvp = uv * u_resolution;
  float d = dot(u_line, vec3(uvp, 1.0));
  if (d > 0.0) {
    uvp.x = uvp.x - 2.0 * u_line.x * d;
    uvp.y = uvp.y - 2.0 * u_line.y * d;
    uv = uvp / u_resolution;
  }
  gl_FragColor = texture2D(u_input_texture, uv);
}
`;

const imageIn = node.imageIn('in');
// const pivotIn = node.number2In('pivot', [0.5, 0.5], { min: 0, max: 1, step: 0.01 } );
const pivotXIn = node.numberIn('pivotX', 0.5, { min: 0, max: 1, step: 0.01 });
const pivotYIn = node.numberIn('pivotY', 0.5, { min: 0, max: 1, step: 0.01 });
const angleIn = node.numberIn('angle', 90, { min: -180, max: 180, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  const r = (angleIn.value * Math.PI) / 180;
  const x = Math.sin(r);
  const y = -Math.cos(r);
  const z = -(pivotXIn.value * x * imageIn.value.width + pivotYIn.value * y * imageIn.value.height);

  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_line: [x, y, z],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
