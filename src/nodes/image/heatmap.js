/**
 * @name Heatmap
 * @description heatmap filter based on monocular depth estimation on image.
 * @category image
 */

//experimental//

const fragmentShader = `
precision mediump float;

uniform sampler2D u_input_texture;
uniform float u_focal_length; // focal length of the camera
uniform float u_disparity_scale; // scale factor for the estimated disparity values
uniform vec3 u_heatmap_min_color; // minimum color for the heatmap
uniform vec3 u_heatmap_max_color; // maximum color for the heatmap
uniform float u_min_depth; // minimum depth value
uniform float u_max_depth; // maximum depth value

varying vec2 v_uv;

void main() {
  vec4 color = texture2D(u_input_texture, v_uv);
  float disparity = (color.r - 0.5) * 2.0 * u_disparity_scale;
  float depth = u_focal_length / disparity;
  vec3 heatmap_color;
  if (depth < u_min_depth) {
      heatmap_color = vec3(0.0, 0.0, 1.0); // blue
  } else if (depth < u_min_depth + (u_max_depth - u_min_depth) / 3.0) {
      heatmap_color = vec3(0.0, 1.0, 1.0); // cyan
  } else if (depth < u_min_depth + (u_max_depth - u_min_depth) * 2.0 / 3.0) {
      heatmap_color = vec3(1.0, 0.0, 1.0); // magenta
  } else if (depth < u_max_depth) {
      heatmap_color = vec3(1.0, 1.0, 0.0); // yellow
  } else {
      heatmap_color = vec3(1.0, 0.0, 0.0); // red
  }
  gl_FragColor = vec4(heatmap_color, 1.0);
}
`;

const imageIn = node.imageIn('in');
const focalIn = node.numberIn('focal length', 20.0, { min: 0.0, max: 150, step: 0.01 });
const disparityIn = node.numberIn('disparity scale', 50.0, { min: 0.0, max: 100, step: 0.1 });
const depthMinIn = node.numberIn('depth min', 0.2, { min: 0.0, max: 1.0, step: 0.01 });
const depthMaxIn = node.numberIn('depth max', 0.6, { min: 0.0, max: 1.0, step: 0.01 });
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
    u_focal_length: focalIn.value,
    u_disparity_scale: disparityIn.value,
    u_min_depth: depthMinIn.value,
    u_max_depth: depthMaxIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
