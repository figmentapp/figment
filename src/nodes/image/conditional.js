/**
 * @name Conditional
 * @description Render an image conditionally.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_true_image;
uniform sampler2D u_false_image;
uniform float u_factor;
varying vec2 v_uv;

void main() {
  vec4 c1 = texture2D(u_true_image, v_uv);
  vec4 c2 = texture2D(u_false_image, v_uv);
  vec3 color = (1.0 - u_factor) * c1.rgb + u_factor * c2.rgb;
  float alpha = (1.0 - u_factor) * c1.a + u_factor * c2.a;
  gl_FragColor = vec4(color, alpha);
}
`;

const conditionIn = node.booleanIn('condition');
const trueImageIn = node.imageIn('true image');
const falseImageIn = node.imageIn('false image');
const fadeTimeIn = node.numberIn('fade time', 0.5, { min: 0, max: 10, step: 0.1 });
const biasIn = node.numberIn('fade bias', 0.5, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let program, framebuffer;

let prevTime;
let factor = 0;
let direction = 1;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
  prevTime = Date.now();
};

node.onRender = () => {
  const dt = (Date.now() - prevTime) / 1000; // convert ms to s
  prevTime = Date.now();

  if (!trueImageIn.value || !falseImageIn.value) return;

  direction = conditionIn.value ? -1 : 1;
  let bias = biasIn.value;
  let adjustedFadeTime = fadeTimeIn.value * (direction === 1 ? bias : 1 - bias);
  adjustedFadeTime = Math.max(adjustedFadeTime, 0.0001); // Avoid division by zero
  factor = factor + (direction * dt) / adjustedFadeTime;
  factor = Math.min(Math.max(factor, 0), 1);

  framebuffer.setSize(trueImageIn.value.width, trueImageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_true_image: trueImageIn.value.texture,
    u_false_image: falseImageIn.value.texture,
    u_factor: factor,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
