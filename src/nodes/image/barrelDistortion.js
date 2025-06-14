/**
 * @name Barrel Distortion
 * @description Barrel distortion on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_distortion;
uniform float u_radius;
varying vec2 v_uv;

vec2 barrelDistortion(vec2 uv){
    float distortion = u_distortion;
    float r = uv.x*uv.x * u_radius + uv.y*uv.y * u_radius;
    uv *= 1.6 + distortion * r + distortion * r * r;
    return uv;
}

void main() {
  vec2 uv = v_uv;
  uv = uv * 2.0 - 1.0;
  uv = barrelDistortion(uv);
  uv = 0.5 * (uv * 0.5 + 1.0);
  gl_FragColor = texture2D(u_input_texture, uv.st);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -5.0, max: 5.0, step: 0.1 });
const rad = node.numberIn('radius', 1.0, { min: 0.0, max: 3.0, step: 0.1 });
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
    u_distortion: dist.value,
    u_radius: rad.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
