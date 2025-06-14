/**
 * @name Emboss
 * @description Emboss convolution on an input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_emboss;
varying vec2 v_uv;


vec4 sample_pixel(in vec2 uv, in float dx, in float dy)
{
    return texture2D(u_input_texture, uv + vec2(dx, dy));
}

float convolve(in float[9] kernel, in vec4[9] color_matrix)
{
   float res = 0.0;
   for (int i=0; i<9; i++)
   {
      res += kernel[i] * color_matrix[i].a;
   }
   return clamp(res + 0.5, 0.0 ,1.0);
}

void build_color_matrix(in vec2 uv, out vec4[9] color_matrix)
{
  float dx = u_emboss.x;
  float dy = u_emboss.y;
  color_matrix[0].rgb = sample_pixel(uv, -dx, -dy).rgb;
  color_matrix[1].rgb = sample_pixel(uv, -dx, 0.0).rgb;
  color_matrix[2].rgb = sample_pixel(uv, -dx,  dy).rgb;
  color_matrix[3].rgb = sample_pixel(uv, 0.0, -dy).rgb;
  color_matrix[4].rgb = sample_pixel(uv, 0.0, 0.0).rgb;
  color_matrix[5].rgb = sample_pixel(uv, 0.0,  dy).rgb;
  color_matrix[6].rgb = sample_pixel(uv,  dx, -dy).rgb;
  color_matrix[7].rgb = sample_pixel(uv,  dx, 0.0).rgb;
  color_matrix[8].rgb = sample_pixel(uv,  dx,  dy).rgb;
}

void build_mean_matrix(inout vec4[9] color_matrix)
{
   for (int i = 0; i < 9; i++)
   {
      color_matrix[i].a = (color_matrix[i].r + color_matrix[i].g + color_matrix[i].b) / 3.;
   }
}

void main() {
  vec2 uv = v_uv;

  float kernel[9];
  kernel[0] = 2.0; kernel[1] = 0.0; kernel[2] = 0.0;
  kernel[3] = 0.0; kernel[4] = -1.; kernel[5] = 0.0;
  kernel[6] = 0.0; kernel[7] = 0.0; kernel[8] = -1.;

  vec4 pixel_matrix[9];

  build_color_matrix(uv, pixel_matrix);
  build_mean_matrix(pixel_matrix);

  float convolved = convolve(kernel, pixel_matrix);
  gl_FragColor = vec4(vec3(convolved), 1.0);
}
`;

const imageIn = node.imageIn('in');
const embossWidthIn = node.numberIn('emboss width', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
const embossHeightIn = node.numberIn('emboss height', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
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
    u_emboss: [embossWidthIn.value, embossHeightIn.value],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
