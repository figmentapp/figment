/**
 * @name Gaussian Blur
 * @description Change the colors of the input image.
 * @category image
 */

//https://www.rastergrid.com/blog/2010/09/efficient-gaussian-blur-with-linear-sampling/
const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_factor;
uniform float u_rtx;
uniform float u_rty;
varying vec2 v_uv;

uniform float offset[3];// = float[](0.0, 1.3846153846, 3.2307692308 );
uniform float weight[3];// = float[](0.2270270270, 0.3162162162, 0.0702702703);


void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_input_texture, uv).rgb*weight[0];

  for (int i=1; i<3; i++) {
    col += texture2D(u_input_texture, uv + vec2(0.0, offset[i])* u_factor/u_rty).rgb * weight[i];
    col += texture2D(u_input_texture, uv - vec2(0.0, offset[i])* u_factor/u_rty).rgb * weight[i];
  }

  for (int i=1; i<3; i++) {
    col += texture2D(u_input_texture, uv + vec2(offset[i])* u_factor/u_rtx, 0.0).rgb * weight[i];
    col += texture2D(u_input_texture, uv - vec2(offset[i])* u_factor/u_rtx, 0.0).rgb * weight[i];
  }

  gl_FragColor = vec4(col/2.0,1.0);
}
`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('factor', 0, { min: 0.0, max: 5.0, step: 0.01 });
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
    u_factor: factorIn.value,
    u_rtx: imageIn.value.width,
    u_rty: imageIn.value.height,
    offset: [0.0, 1.3846153846, 3.2307692308],
    weight: [0.227027027, 0.3162162162, 0.0702702703],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
