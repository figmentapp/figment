import * as twgl from 'twgl.js';
import { m4 } from 'twgl.js';
window.m4 = m4;
window.twgl = twgl;

export const core = {};
export const image = {};
export const ml = {};

////////////////////////////////////////////////////////////////////////////////
//// CORE OPERATIONS ///////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

core.out = `// Signifies that this is the output of the network.
const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

node.onRender = () => {
  imageOut.set(imageIn.value);
}
`;

////////////////////////////////////////////////////////////////////////////////
//// IMAGE OPERATIONS //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

image.blur = `// Blur an input image

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;

#define BOT 1.-u_step
#define TOP 1.+u_step
#define CEN 1

void main() {
  vec2 uv = v_uv;

  gl_FragColor = 	texture2D( u_input_texture, uv*vec2(BOT, BOT))/8.
  +texture2D(u_input_texture, uv*vec2(BOT, BOT))/8.
  +texture2D(u_input_texture, uv*vec2(TOP, BOT))/8.
  +texture2D(u_input_texture, uv*vec2(BOT, CEN))/8.
  +texture2D(u_input_texture, uv*vec2(TOP, CEN))/8.
  +texture2D(u_input_texture, uv*vec2(BOT, TOP))/8.
  +texture2D(u_input_texture, uv*vec2(CEN, TOP))/8.
  +texture2D(u_input_texture, uv*vec2(TOP, TOP))/8.;

}
\`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001});
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: blurIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}
`;

image.border = `// Generate a border around the image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec4 u_border_color;
uniform float u_border_size;
varying vec2 v_uv;

void main() {
  float image_ratio = u_resolution.x / u_resolution.y;
  float border_frac = u_border_size / u_resolution.x;
  if (v_uv.x < border_frac || v_uv.x > 1.0 - border_frac || v_uv.y < border_frac || v_uv.y > 1.0 - border_frac) {
    gl_FragColor = u_border_color;
  } else {
    gl_FragColor = texture2D(u_input_texture, v_uv);
  }
}
\`

const imageIn = node.imageIn('in');
const borderSize = node.numberIn('borderSize', 10.0, { min: 1, max: 512, step: 1 });
const borderColor = node.colorIn('borderColor', [255, 255, 255, 1.0]);
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
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_border_size: borderSize.value,
    u_border_color: [borderColor.value[0] / 255, borderColor.value[1] / 255, borderColor.value[2] / 255, borderColor.value[3]]
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.canny = `// canny edge detection on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform float u_thickness;
uniform float u_factor;
varying vec2 v_uv;

float getAve(vec2 uv){
    vec3 rgb = texture2D(u_input_texture, uv).rgb;
    vec3 lum = vec3(1.,1.,1.);
    return dot(lum, rgb);
}

vec4 sobel(vec2 fragCoord, vec2 dir){
    vec2 uv2 = v_uv.xy;
    vec2 texel = 1./u_resolution.xy;
    float np = getAve(uv2 + (vec2(-1,+1) + dir ) * texel * u_thickness);
    float zp = getAve(uv2 + (vec2( 0,+1) + dir ) * texel * u_thickness);
    float pp = getAve(uv2 + (vec2(+1,+1) + dir ) * texel * u_thickness);
    
    float nz = getAve(uv2 + (vec2(-1, 0) + dir ) * texel * u_thickness);
    // zz = 0
    float pz = getAve(uv2 + (vec2(+1, 0) + dir ) * texel * u_thickness);
    
    float nn = getAve(uv2 + (vec2(-1,-1) + dir ) * texel * u_thickness);
    float zn = getAve(uv2 + (vec2( 0,-1) + dir ) * texel * u_thickness);
    float pn = getAve(uv2 + (vec2(+1,-1) + dir ) * texel * u_thickness);
    
    #if 0
    float gx = (np*-1. + nz*-2. + nn*-1. + pp*1. + pz*2. + pn*1.);
    float gy = (np*-1. + zp*-2. + pp*-1. + nn*1. + zn*2. + pn*1.);
    #else
    // https://www.shadertoy.com/view/Wds3Rl
    float gx = (np*-3. + nz*-10. + nn*-3. + pp*3. + pz*10. + pn*3.);
    float gy = (np*-3. + zp*-10. + pp*-3. + nn*3. + zn*10. + pn*3.);
    #endif
    
    vec2 G = vec2(gx,gy);
    float grad = length(G);
    float angle = atan(G.y, G.x);
    
    return vec4(G, grad, angle);
}

vec2 hysteresisThr(vec2 fragCoord, float mn, float mx){

    vec4 edge = sobel(fragCoord, vec2(0.0));

    vec2 dir = vec2(cos(edge.w), sin(edge.w));
    dir *= vec2(-1,1); // rotate 90 degrees.
    
    vec4 edgep = sobel(fragCoord, dir);
    vec4 edgen = sobel(fragCoord, -dir);

    if(edge.z < edgep.z || edge.z < edgen.z ) edge.z = 0.;
    
    return vec2(
        (edge.z > mn) ? edge.z : 0.,
        (edge.z > mx) ? edge.z : 0.
    );
}

float cannyEdge(vec2 fragCoord, float mn, float mx){

    vec2 np = hysteresisThr(fragCoord + vec2(-1.,+1.), mn, mx);
    vec2 zp = hysteresisThr(fragCoord + vec2( 0.,+1.), mn, mx);
    vec2 pp = hysteresisThr(fragCoord + vec2(+1.,+1.), mn, mx);
    
    vec2 nz = hysteresisThr(fragCoord + vec2(-1., 0.), mn, mx);
    vec2 zz = hysteresisThr(fragCoord + vec2( 0., 0.), mn, mx);
    vec2 pz = hysteresisThr(fragCoord + vec2(+1., 0.), mn, mx);
    
    vec2 nn = hysteresisThr(fragCoord + vec2(-1.,-1.), mn, mx);
    vec2 zn = hysteresisThr(fragCoord + vec2( 0.,-1.), mn, mx);
    vec2 pn = hysteresisThr(fragCoord + vec2(+1.,-1.), mn, mx);
    
    return min(1., step(1e-3, zz.x) * (zp.y + nz.y + pz.y + zn.y)*8.);
}

void main(){
    vec2 uv = v_uv;
    float edge = cannyEdge(uv.xy, u_factor, u_factor);   
    gl_FragColor = vec4(vec3(1.-edge),1.0);
}
\`;

const imageIn = node.imageIn('in');
const thicknessIn = node.numberIn('thickness', 1.5, { min: 0.0, max: 10.0, step: 0.1 });
const factorIn = node.numberIn('factor', 3., { min: 0.0, max: 10.0, step: 0.1 });
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
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_thickness: thicknessIn.value,
    u_factor: factorIn.value
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.composite = `// Combine two images together.

const image1In = node.imageIn('image 1');
const image2In = node.imageIn('image 2');
const factorIn = node.numberIn('factor', 0.5, { min: 0, max: 1, step: 0.01 });
const operationIn = node.selectIn('operation', ['normal', 'darken', 'multiply', '---', 'difference'], 'normal');
const imageOut = node.imageOut('out');

function updateShader() {
  let blendFunction;
  if (operationIn.value === 'normal') {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'darken') {
    blendFunction = 'factor * vec3(min(c1.r, c2.r), min(c1.g, c2.g), min(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'multiply') {
    blendFunction = 'factor * (c1.rgb * c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'lighten') {
    blendFunction = 'factor * vec3(max(c1.r, c2.r), max(c1.g, c2.g), max(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'difference') {
    blendFunction = 'factor * abs(c1.rgb - c2.rgb) + (1.0 - factor) * c1.rgb';
  } else {
    throw new Error(\`Unknown operation: \${operationIn.value}\`);
  }
  const fragmentShader = \`
  precision mediump float;
  uniform sampler2D u_image_1;
  uniform sampler2D u_image_2;
  uniform float u_factor;
  varying vec2 v_uv;
  void main() {
    vec4 c1 = texture2D(u_image_1, v_uv);
    vec4 c2 = texture2D(u_image_2, v_uv);
    float factor = u_factor * c2.a;
    vec3 color = \${blendFunction};
    gl_FragColor = vec4(color, c1.a);
  }
  \`;
  program = figment.createShaderProgram(fragmentShader);
}

let program, framebuffer;

node.onStart = (props) => {
  updateShader();
  framebuffer = new figment.Framebuffer();
}

node.onRender = () => {
  if (!image1In.value || !image2In.value) return;
  framebuffer.setSize(image1In.value.width, image1In.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_image_1: image1In.value.texture,
    u_image_2: image2In.value.texture,
    u_factor: factorIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

operationIn.onChange = updateShader;
`;

image.constant = `// Render a constant color.

const fragmentShader = \`
precision mediump float;
uniform vec4 u_color;
varying vec2 v_uv;
void main() {
  gl_FragColor = u_color;
}
\`;

const colorIn = node.colorIn('color', [128, 128, 128, 1.0]);
const widthIn = node.numberIn('width', 1024, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

node.onRender = () => {
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255, colorIn.value[3]]
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.crop = `// Crop input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
// uniform vec2 u_offset;
uniform vec2 u_output_size;
varying vec2 v_uv;

void main() {
  float image_ratio = u_resolution.x / u_resolution.y;
  // Crop size box (width / height)
  float crop_width = u_output_size.x;
  float crop_height = u_output_size.x;
  float crop_ratio = crop_width/crop_height;
  float delta_ratio = crop_ratio / image_ratio;
  if (image_ratio >  crop_ratio) {
    // The image is wider than the box
    float scale_factor = crop_width / u_resolution.x;
    float height_diff = (crop_height - u_resolution.y * scale_factor) / crop_height;
    float half_height_diff = height_diff / 2.0;
    if (v_uv.y < half_height_diff || v_uv.y > 1.0 - half_height_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2(v_uv.x, (v_uv.y - half_height_diff) / delta_ratio);
      vec4 texColor = texture2D(u_input_texture,uv);
      // gl_FragColor = texColor;
      gl_FragColor = u_color * texture2D(u_input_texture, uv);
    }
  } else {
    float scale_factor = crop_height / u_resolution.y;
    float width_diff = (crop_width - u_resolution.x * scale_factor) / crop_width;
    float half_width_diff = width_diff / 2.0;
    if (v_uv.x < half_width_diff || v_uv.x > 1.0 - half_width_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2((v_uv.x - half_width_diff) * delta_ratio, v_uv.y);
      vec4 texColor = texture2D(u_input_texture,uv);
      // gl_FragColor = texColor;
     gl_FragColor = u_color * texture2D(u_input_texture, uv);
    }
  }
}
\`;

const imageIn = node.imageIn('in');
// const offsetXIn = node.numberIn('offsetX', 50.0, { min: 1, max: 4096, step: 1 });
// const offsetYIn = node.numberIn('offsetY', 50.0, { min: 1, max: 4096, step: 1 });
const widthIn = node.numberIn('width', 512.0, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512.0, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

node.onRender = () => {
  if (!imageIn.value) return;
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    // u_offset: [offsetXIn.value, offsetYIn.value],
    u_output_size: [widthIn.value, heightIn.value]});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.maskCircle = `// Draw a circular mask of an image or constant.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform bool u_invert;
varying vec2 v_uv;

float draw_circle(vec2 coord, float radius) {
  return step(length(coord), radius);
}

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.xy);
  vec2 offset = vec2(0.5, 0.5);
  float circle = draw_circle(uv - offset, u_radius);
  u_invert ? circle = 1.0 - circle : circle = circle;
  vec3 colort = vec3(circle);
  gl_FragColor = vec4(colort, 1.0)*color; 
}
\`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 0.5, step: 0.01 });
const invertIn = node.toggleIn('invert', true);
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_radius: radiusIn.value,u_invert: invertIn.value});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.emboss = `// Emboss convolution on an input image.

const fragmentShader = \`
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
\`;

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
    u_emboss: [embossWidthIn.value, embossHeightIn.value]  
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.grayscale = `// Grayscale conversion of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(gray, gray, gray, 1.0);
}
\`;

const imageIn = node.imageIn('in');
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.invert = `// Invert colors of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_input_texture, v_uv);
  gl_FragColor.rgb = 1.0 - gl_FragColor.rgb;
}
\`;

const imageIn = node.imageIn('in');
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.lensDistortion = `// Distort an image using a lens distortion shader.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_k1;
uniform float u_k2;
uniform vec2 u_offset;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec2 t = uv - 0.5;
  float r2 = t.x * t.x + t.y * t.y;
  float f = 0.0;

  if (u_k2 == 0.0) {
    f = 1.0 + r2 * u_k1;
  } else {
    f = 1.0 + r2 * (u_k1 + u_k2 * sqrt(r2));
  }
  vec2 distorted_uv = f * t + 0.5 + u_offset;
  if (distorted_uv.x < 0.0 || distorted_uv.x > 1.0 || distorted_uv.y < 0.0 || distorted_uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 col = texture2D(u_input_texture, distorted_uv).rgb;
  gl_FragColor = vec4(col, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const k1In = node.numberIn('k1', 0.0, { min: -10, max: 10, step: 0.01 });
const k2In = node.numberIn('k2', 0.0, { min: -10, max: 10, step: 0.01 });
const offsetXIn = node.numberIn('offsetX', 0.0, { min: -1, max: 1, step: 0.01 });
const offsetYIn = node.numberIn('offsetY', 0.0, { min: -1, max: 1, step: 0.01 });
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
    u_k1: k1In.value,
    u_k2: k2In.value,
    u_offset: [offsetXIn.value, offsetYIn.value],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.levels = `// Change the brightness/contrast/saturation.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
varying vec2 v_uv;

mat4 brightnessMatrix( float brightness )
{
    return mat4( 1, 0, 0, 0,
                 0, 1, 0, 0,
                 0, 0, 1, 0,
                 brightness, brightness, brightness, 1 );
}

mat4 contrastMatrix( float contrast )
{
  float t = ( 1.0 - contrast ) / 2.0;
    
    return mat4( contrast, 0, 0, 0,
                 0, contrast, 0, 0,
                 0, 0, contrast, 0,
                 t, t, t, 1 );

}

mat4 saturationMatrix( float saturation )
{
    vec3 luminance = vec3( 0.3086, 0.6094, 0.0820 );
    float oneMinusSat = 1.0 - saturation;
    
    vec3 red = vec3( luminance.x * oneMinusSat );
    red+= vec3( saturation, 0, 0 );
    
    vec3 green = vec3( luminance.y * oneMinusSat );
    green += vec3( 0, saturation, 0 );
    
    vec3 blue = vec3( luminance.z * oneMinusSat );
    blue += vec3( 0, 0, saturation );
    
    return mat4( red,     0,
                 green,   0,
                 blue,    0,
                 0, 0, 0, 1 );
}

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D( u_input_texture, uv );
    
  gl_FragColor = brightnessMatrix( u_brightness ) *
          contrastMatrix( u_contrast ) * 
          saturationMatrix( u_saturation ) *
          color;

  }
\`;

const imageIn = node.imageIn('in');
const brightnessIn = node.numberIn('brightness', 0.0, { min: -1, max: 1, step: 0.01 });
const contrastIn = node.numberIn('contrast', 1.0, { min: 0, max: 4, step: 0.01 });
const saturationIn = node.numberIn('saturation', 1.0, { min: 0, max: 1, step: 0.01 });
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
    u_brightness: brightnessIn.value,
    u_contrast: contrastIn.value,
    u_saturation: saturationIn.value
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.loadImage = `// Load an image from a file.

const fileIn = node.fileIn('file', '', { fileType: 'image' });
const imageOut = node.imageOut('out');

let _texture, _framebuffer, _program;

node.onStart = () => {
  _program = figment.createShaderProgram();
  _framebuffer = new figment.Framebuffer();
};

node.onRender = async () => {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  if (_texture) {
    gl.deleteTexture(_texture);
  }
  try {
    const { texture, image } = await figment.createTextureFromUrlAsync(imageUrl.toString());
    _texture = texture;
    _framebuffer.setSize(image.naturalWidth, image.naturalHeight);
    _framebuffer.bind();
    figment.clear();
    figment.drawQuad(_program, { u_image: _texture });
    _framebuffer.unbind();
    imageOut.set(_framebuffer);
  } catch (err) {
      throw new Error(\`Image load error: \${err\}\`);
  }
};
`;

image.loadImageFolder = `// Load a folder of images.
node.timeDependent = true;
const folderIn = node.directoryIn('folder', '');
const filterIn = node.stringIn('filter', '*.jpg');
const animateIn = node.toggleIn('animate', false);
const frameRateIn = node.numberIn('frameRate', 10, { min: 1, max: 60 });
const imageOut = node.imageOut('out');

let _files = [], _fileIndex, _texture, _image, _framebuffer, _program, _lastTime;

node.onStart = () => {
  _program = figment.createShaderProgram();
  _framebuffer = new figment.Framebuffer();
  _fileIndex = 0;
  _lastTime = Date.now();
}

node.onRender = () => {
  const deltaTime = Date.now() - _lastTime;
  if (deltaTime > 1000 / frameRateIn.value) {
    _lastTime = Date.now();
    if (animateIn.value) {
      nextImage();
    }
  }

  if (_image && _texture) {
    _framebuffer.setSize(_image.naturalWidth, _image.naturalHeight);
    _framebuffer.bind();
    figment.clear();
    figment.drawQuad(_program, { u_image: _texture });
    _framebuffer.unbind();
    imageOut.set(_framebuffer);
  }
}

function loadDirectory() {
  if (!folderIn.value || folderIn.value.trim().length === 0) return;
  const baseDir = figment.filePathForAsset(folderIn.value);
  window.desktop.globFiles(baseDir, filterIn.value, onLoadDirectory);
}

function onLoadDirectory(err, files) {
  _files = files;
  if (err) {
    console.error(err);
    onLoadError();
    return;
  }
  if (files.length === 0) {
    onLoadError();
    return;
  }
  _fileIndex = -1;
  nextImage();
}

function onLoadError() {
  _image = null;
  _texture = null;
  const texture = figment.createErrorTexture();
  _framebuffer.setSize(100, 56);
  _framebuffer.bind();
  figment.drawQuad(_program, { u_image: texture });
  _framebuffer.unbind();
  imageOut.set(_framebuffer);
}

function onLoadImage(err, texture, image) {
  if (err) {
    throw new Error(\`Image load error: \${err\}\`);
  }
  _texture = texture;
  _image = image;
}

function nextImage() {
  if (_files.length === 0) return;
  _fileIndex++;
  if (_fileIndex >= _files.length) {
    _fileIndex = 0;
  }
  if (_texture) {
    window.gl.deleteTexture(_texture);
    _texture = null;
  }

  const file = _files[_fileIndex];
  const imageUrl = figment.urlForAsset(file);
  figment.createTextureFromUrl(imageUrl.toString(), onLoadImage);
}

folderIn.onChange = loadDirectory;
filterIn.onChange = loadDirectory;
`;

image.loadMovie = `// Load a movie file.
node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'movie' });
const animateIn = node.toggleIn('animate', true);
const speedIn = node.numberIn('speed', 1, { min: 0.0, max: 10, step: 0.1 });
const restartIn = node.triggerButtonIn('restart');
const imageOut = node.imageOut('out');

let framebuffer, program, video, videoReady, shouldLoad;

node.onStart = () => {
  framebuffer = new figment.Framebuffer();
  videoReady = false;
  shouldLoad = true;
}

async function loadMovie() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  if (video) {
    video.remove();
  }
  await new Promise((resolve) => {
    video = document.createElement('video');
    videoReady = false;
    const fileUrl = figment.urlForAsset(fileIn.value);
    video.src = fileUrl;
    video.loop = true;
    video.autoplay = animateIn.value;
    video.muted = true;
    video.playbackRate = speedIn.value;
    video.addEventListener('canplay', resolve, { once: true });
  });
  videoReady = true;
  framebuffer.setSize(video.videoWidth, video.videoHeight);
}

node.onRender = async () => {
  if (shouldLoad) {
    await loadMovie();
    shouldLoad = false;
  }
  if (!video || !framebuffer || !videoReady) return;
  if (!animateIn.value) return;
  framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  // To avoid re-uploading the video frame, we pass it along into the framebuffer object.
  // If the next node turns out to be a mediapose node, it will pick up the image object and work with it directly.
  framebuffer._directImageHack = video;
  imageOut.set(framebuffer);
};

node.onStop = () => {
  if (video) {
    video.pause();
    video.remove();
    video = null;
  }
}

function changeSpeed() {
  if (video) {
    video.playbackRate = speedIn.value;
  }
}

function toggleAnimate() {
  if (video) {
    if (animateIn.value) {
      video.play();
    } else {
      video.pause();
    }
  }
}

function restartVideo() {
  if (video) {
    video.currentTime = 0;
  }
}
node.onReset = restartVideo;
fileIn.onChange = () => { shouldLoad = true; };
speedIn.onChange = changeSpeed;
animateIn.onChange = toggleAnimate;
restartIn.onTrigger = restartVideo;
`;

image.lookup = `// Map the colors of one image to another image.

const sourceIn = node.imageIn('source');
const lookupIn = node.imageIn('lookup');
const methodIn = node.selectIn('method', ['luminance', 'red', 'green', 'blue', 'alpha']);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  updateShader();
  framebuffer = new figment.Framebuffer();
};

function updateShader() {
  let lookupFunction;
  if (methodIn.value === 'luminance') {
    lookupFunction = 'dot(source.rgb, vec3(0.299, 0.587, 0.114))';
  } else if (methodIn.value === 'red') {
    lookupFunction = 'source.r';
  } else if (methodIn.value === 'green') {
    lookupFunction = 'source.g';
  } else if (methodIn.value === 'blue') {
    lookupFunction = 'source.b';
  } else if (methodIn.value === 'alpha') {
    lookupFunction = 'source.a';
  }
  const fragmentShader = \`
  precision mediump float;
  uniform sampler2D u_source_texture;
  uniform sampler2D u_lookup_texture;
  varying vec2 v_uv;
  void main() {
    vec2 uv = v_uv;
    vec4 source = texture2D(u_source_texture, uv);
    float value = \${lookupFunction};
    vec4 lookup = texture2D(u_lookup_texture, vec2(value, 0.5));
    gl_FragColor = lookup;
  }
  \`;
  program = figment.createShaderProgram(fragmentShader);
}

node.onRender = () => {
  if (!sourceIn.value) return;
  if (!lookupIn.value) return;
  framebuffer.setSize(sourceIn.value.width, sourceIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { 
    u_source_texture: sourceIn.value.texture,
    u_lookup_texture: lookupIn.value.texture,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

methodIn.onChange = updateShader;
`;

image.mirror = `// Mirror the input image over a specific axis.

const fragmentShader = \`
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
\`;

const imageIn = node.imageIn('in');
// const pivotIn = node.number2In('pivot', [0.5, 0.5], { min: 0, max: 1, step: 0.01 } );
const pivotXIn = node.numberIn('pivotX', 0.5, { min: 0, max: 1, step: 0.01 } );
const pivotYIn = node.numberIn('pivotY', 0.5, { min: 0, max: 1, step: 0.01 } );
const angleIn = node.numberIn('angle', 90, { min: -180, max: 180, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  const r = angleIn.value * Math.PI / 180;
  const x = Math.sin(r);
  const y = -Math.cos(r);
  const z = -((pivotXIn.value * x * imageIn.value.width) + (pivotYIn.value * y * imageIn.value.height));

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

}
`;

image.modcolor = `// Modulate colors of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_red;
uniform float u_green;
uniform float u_blue;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 col = texture2D(u_input_texture, uv.st);
  col.r += mod(col.r, u_red);
  col.g += mod(col.g, u_green);
  col.b += mod(col.b, u_blue);
  gl_FragColor = col;
}
\`;

const imageIn = node.imageIn('in');
const redIn = node.numberIn('red', 0, { min: 0, max: 1, step: 0.01 });
const greenIn = node.numberIn('green', 0.1, { min: 0, max: 1, step: 0.01 });
const blueIn = node.numberIn('blue', 1, { min: 0, max: 1, step: 0.01 });
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
    u_red: redIn.value,
    u_green: greenIn.value,
    u_blue: blueIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.null = `// Does nothing.
const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

node.onRender = () => {
  imageOut.set(imageIn.value);
};
`;

image.pixelate = `// Pixelate input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 _pixels;
varying vec2 v_uv;

void main() {
  vec2 p = v_uv.st;
  p.x -= mod(p.x, 1.0 / (100.0-_pixels.x));
  p.y -= mod(p.y, 1.0 / (100.0-_pixels.y));
    
  vec3 col = texture2D(u_input_texture, p).rgb;
  gl_FragColor = vec4(col, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const pixelsX = node.numberIn('amountX', 20, { min: 0.0, max: 100.0, step: 1.0 });
const pixelsY = node.numberIn('amountY', 10, { min: 0.0, max: 100.0, step: 1.0 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, _pixels: [pixelsX.value, pixelsY.value] });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.reduceColor = `// reduce the amount of colors of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_factor;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  vec3 col = color.rgb; 
  col = floor(col * u_factor) / u_factor; 
  gl_FragColor = vec4(col,1.0);
}
\`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('reduce colors', 2.0, { min: 0.0, max: 100.0, step: 0.1});
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_factor: factorIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.resize = `// Resize the input image

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec4 u_background_color;
uniform vec2 u_scale;
varying vec2 v_uv;

void main() {
  vec2 uv = u_scale * (v_uv - 0.5) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = u_background_color;
  } else {
    gl_FragColor = texture2D(u_input_texture, uv);
  }
}
\`;

const imageIn = node.imageIn('in');
const widthIn = node.numberIn('width', 512, { min: 0 });
const heightIn = node.numberIn('height', 512, { min: 0 });
const fitIn = node.selectIn('fit', ['fill', 'contain', 'cover'], 'cover');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

const LANDSCAPE = 1;
const PORTRAIT = 2;

node.onRender = () => {
  if (!imageIn.value) return;
  let inRatio = imageIn.value.width / imageIn.value.height;
  let outRatio = widthIn.value / heightIn.value;
  let aspect;
  let orientation;
  if (inRatio > outRatio) {
    orientation = LANDSCAPE;
    aspect = inRatio / outRatio;
  } else {
    orientation = PORTRAIT;
    aspect = outRatio / inRatio;
  }
  let scale;
  if (fitIn.value == 'fill') {
    // We will stretch the image, so just use the input scale.
    scale = [1, 1];
  } else if (fitIn.value == 'contain') {
    // Either width or height will be smaller, so we need to scale the other one.
    if (orientation === LANDSCAPE) {
      scale = [1, aspect];
    } else {
      scale = [aspect, 1];
    }
  } else if (fitIn.value == 'cover') {
    // Either width or height will extend outside of the frame.
    if (orientation === LANDSCAPE) {
      scale = [1 / aspect, 1];
    } else {
      scale = [1, 1 / aspect];
    }
  }

  const color = backgroundIn.value;
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture,
    u_scale: scale,
    u_background_color: [color[0] / 255, color[1] / 255, color[2] / 255, color[3]],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.sharpen = `// Sharpen an input image

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;
//#define STEP .005

#define BOT 1.-u_step
#define TOP 1.+u_step
#define CEN 1

void main() {
  vec2 uv = v_uv;

  gl_FragColor = texture2D( u_input_texture, uv) *2.
  -texture2D(u_input_texture, uv*vec2(BOT, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(CEN, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(BOT, CEN))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, CEN))/8.
  -texture2D(u_input_texture, uv*vec2(BOT, TOP))/8.
  -texture2D(u_input_texture, uv*vec2(CEN, TOP))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, TOP))/8.;
  
}
\`;

const imageIn = node.imageIn('in');
const sharpenIn = node.numberIn('amount', 0.005, { min: 0, max: 0.1, step: 0.001});
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: sharpenIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.sobel = `// Sobel edge detection on input image.
const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
varying vec2 v_uv;

void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord)
{
  float w = 1.0 / u_resolution.x;
  float h = 1.0 / u_resolution.y;

  n[0] = texture2D(tex, coord + vec2( -w, -h));
  n[1] = texture2D(tex, coord + vec2(0.0, -h));
  n[2] = texture2D(tex, coord + vec2(  w, -h));
  n[3] = texture2D(tex, coord + vec2( -w, 0.0));
  n[4] = texture2D(tex, coord);
  n[5] = texture2D(tex, coord + vec2(  w, 0.0));
  n[6] = texture2D(tex, coord + vec2( -w, h));
  n[7] = texture2D(tex, coord + vec2(0.0, h));
  n[8] = texture2D(tex, coord + vec2(  w, h));
}

void main() {
  vec2 uv = v_uv;
  vec4 n[9];
  make_kernel(n, u_input_texture, uv.st);

  vec4 sobel_edge_h = n[2] + (2.0*n[5]) + n[8] - (n[0] + (2.0*n[3]) + n[6]);
  vec4 sobel_edge_v = n[0] + (2.0*n[1]) + n[2] - (n[6] + (2.0*n[7]) + n[8]);
  vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));

  gl_FragColor = vec4(1.0 - sobel.rgb, 1.0);
}

\`;

const imageIn = node.imageIn('in');
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
    u_resolution: [imageIn.value.width, imageIn.value.height],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.squares = `// return input image as squares.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
varying vec2 v_uv;
uniform float u_factor;

void main() {
  vec2 uv = v_uv;
  vec2 uv2 = floor( uv * u_factor ) / u_factor;   
  vec3 col = texture2D(u_input_texture, uv2).rgb;     
  gl_FragColor = vec4(col,1.);
}
\`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('amount', 10.0, { min: 2.0, max: 200.0, step: 1.0});
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_factor: factorIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.stack = `// Combine 2 images horizontally / vertically.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture_1;
uniform sampler2D u_input_texture_2;
uniform float u_direction;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  if (u_direction == 0.0) {
    if (uv.x < 0.5) {
      gl_FragColor = texture2D(u_input_texture_1, vec2(uv.x * 2.0, uv.y));
    } else {
      gl_FragColor = texture2D(u_input_texture_2, vec2(uv.x * 2.0 - 1.0, uv.y));
    }
  } else {
    if (uv.y < 0.5) {
      gl_FragColor = texture2D(u_input_texture_1, vec2(uv.x, uv.y * 2.0));
    } else {
      gl_FragColor = texture2D(u_input_texture_2, vec2(uv.x, uv.y * 2.0 - 1.0));
    }
  }
}
\`;

const imageIn1 = node.imageIn('image 1');
const imageIn2 = node.imageIn('image 2');
const directionIn = node.selectIn('Direction', ['Horizontal', 'Vertical']);
const imageOut = node.imageOut('out');

let program, framebuffer,m;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn1.value || !imageIn2.value) return;
  let u_direction;
  if (directionIn.value === 'Horizontal') {
    u_direction = 0.0;
    framebuffer.setSize(imageIn1.value.width + imageIn2.value.width, imageIn1.value.height);
  } else {
    u_direction = 1.0;
    framebuffer.setSize(imageIn1.value.width, imageIn1.value.height + imageIn2.value.height);
  }
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture_1: imageIn1.value.texture,
    u_input_texture_2: imageIn2.value.texture,
    u_direction,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.threshold = `// Change brightness threshold of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_input_texture, uv.st).rgb;
  float brightness = 0.33333 * (col.r + col.g + col.b);
  float b = mix(0.0, 1.0, step(u_threshold, brightness));
  gl_FragColor = vec4(b, b, b, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0, max: 1, step: 0.01 });
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
`;

image.trail = `// Don't erase the previous input image, creating a trail.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec4 color = texture2D(u_input_texture, v_uv);
  if (color.a <= 0.01) {
    discard;
  } else {
    gl_FragColor = color;
  }
}
\`;

const imageIn = node.imageIn('in');
const clearButtonIn = node.triggerButtonIn('clear');
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
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

function clear() {
  framebuffer.bind();
  figment.clear();
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

clearButtonIn.onTrigger = clear;
`;

image.transform = `// Transform the image.

const vertexShader = \`
uniform mat4 u_transform;
attribute vec3 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_transform * vec4(a_position, 1.0);
}\`;

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_input_texture, v_uv.st);
}\`;

const imageIn = node.imageIn('in');
const translateXIn = node.numberIn('translateX', 0, { min: -2, max: 2, step: 0.01 });
const translateYIn = node.numberIn('translateY', 0, { min: -2, max: 2, step: 0.01 });
const scaleXIn = node.numberIn('scaleX', 1, { min: -10, max: 10, step: 0.01 });
const scaleYIn = node.numberIn('scaleY', 1, { min: -10, max: 10, step: 0.01 });
const rotateIn = node.numberIn('rotate', 0.0, { min: -360, max: 360, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(vertexShader, fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  let transform = m4.identity();
  let factorX = 1.0 / imageIn.value.width;
  let factorY = 1.0 / imageIn.value.height;

  transform = m4.translate(transform, [factorX/2, factorY/2, 0]);
  transform = m4.translate(transform, [translateXIn.value, translateYIn.value, 0]);
  transform = m4.scale(transform, [scaleXIn.value, scaleYIn.value, 1]);
  transform = m4.rotateZ(transform, rotateIn.value * Math.PI / 180);
  transform = m4.translate(transform, [-factorX/2, -factorY/2, 0]);
  // console.log(transform);
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { 
    u_transform: transform,
    u_input_texture: imageIn.value.texture 
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.wrap = `// Circular wrap of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform float u_twist;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
 vec2 p = -1.0 + 2.0 * uv.st;
 float r = sqrt(dot(p,p));

p.x = mod(p.x + r * u_twist, 1.0);
 float a = atan(p.y,p.x);

uv.x = (a + 3.14159265359)/6.28318530718;
uv.y = r / sqrt(u_radius);
 vec3 col = texture2D(u_input_texture, uv).rgb;
 gl_FragColor = vec4(col, 1.0);

}
\`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 2.0, { min: 0, max: 5, step: 0.01 });
const twistIn = node.numberIn('twist', 0.0, { min: -1, max: 1, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_radius: radiusIn.value,u_twist: twistIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.unsplash = `// Fetch a random image from Unsplash.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
\`;

const queryIn = node.stringIn('query', 'kitten');
const widthIn = node.numberIn('width', 300);
const heightIn = node.numberIn('height', 300);
const imageOut = node.imageOut('image');

let _texture, framebuffer, program, shouldLoad;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
  shouldLoad = true;
}

node.onRender = async () => {
  if (!shouldLoad) return;
  if (!queryIn.value || queryIn.value.trim().length === 0) return;
  const url = \`https://source.unsplash.com/\${widthIn.value}x\${heightIn.value}?\${queryIn.value}\`;
  try {
    const { texture, image } = await figment.createTextureFromUrlAsync(url);
    shouldLoad = false;
    if (_texture) {
      gl.deleteTexture(_texture);
    }
    _texture = texture;
    framebuffer.setSize(image.naturalWidth, image.naturalHeight);
    framebuffer.bind();
    figment.clear();
    figment.drawQuad(program, { u_image: texture });
    framebuffer.unbind();
    imageOut.set(framebuffer);
  } catch (err) {
    console.error(\`Image load error: \${err\}\`);
  }
}

function setShouldLoad() {
  shouldLoad = true;
}

queryIn.onChange = figment.debounce(setShouldLoad, 500);
widthIn.onChange = setShouldLoad;
heightIn.onChange = setShouldLoad;
`;

image.webcamImage = `// Return a webcam stream
node.timeDependent = true;
const frameRate = node.numberIn('frameRate', 30);
const imageOut = node.imageOut('image');

let _video, _stream, _timer, _framebuffer, shouldLoad;

node.onStart = async () => {
  shouldLoad = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
  
    _video = document.createElement('video');
    _video.width = 640;
    _video.height = 480;
    _video.srcObject = stream;
    _video.play();
    _stream = stream;
    _framebuffer = new figment.Framebuffer(_video.width, _video.height);
    _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
    shouldLoad = true;
  } catch (err) {
    console.error('no camera input!', err.name);
  }
};

node.onRender = () => {
  if (!_video || !_framebuffer) return;
  if (_video.readyState !== _video.HAVE_ENOUGH_DATA) return;
  if (!shouldLoad) return;
  _framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
  shouldLoad = false;
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream && _stream.active) {
    _stream.getTracks().forEach(track => track.stop())
    _video = null;
  }
};

function setShouldLoad() {
  shouldLoad = true;
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
};
`;

////////////////////////////////////////////////////////////////////////////////
//// MACHINE LEARNING //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

ml.detectFacesBlazeFace = `// Detect faces in an image (blazeface model)
const imageIn = node.imageIn('in');
const sizeIn = node.numberIn('size',5);
const colorIn = node.colorIn('color', [0, 220, 20, 1.0]);
const toggleIn = node.toggleIn('with image',false);
const imageOut = node.imageOut('out');

let _model, _canvas, _ctx, _framebuffer;

node.onStart = async () => {
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer(1, 1);
  _model = await figment.loadModel('blazeface', 'blazeface');
};

function detectFaces() {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_model) return;
  if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
    _canvas.width = imageIn.value.width;
    _canvas.height = imageIn.value.height;
    _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  }
  const imageData = figment.framebufferToImageData(imageIn.value);
  const returnTensors = true;
  const s = sizeIn.value;
  _model.estimateFaces(imageData, returnTensors).then(predictions => {
    _ctx.clearRect(0, 0, imageIn.value.width, imageIn.value.height);
    if(toggleIn.value){
      _ctx.putImageData(imageData, 0, 0);
    }
    if (predictions.length > 0) {
      for (let i = 0; i < predictions.length; i++) {
        if (returnTensors) {
          predictions[i].topLeft = predictions[i].topLeft.arraySync();
          predictions[i].bottomRight = predictions[i].bottomRight.arraySync();
          predictions[i].landmarks = predictions[i].landmarks.arraySync();
        }
        const start = predictions[i].topLeft;
        const end = predictions[i].bottomRight;
        const size = [end[0] - start[0], end[1] - start[1]];
  
        // Render a rectangle over each detected face.
        _ctx.fillStyle = 'rgba(255,130,0,.3)';
        _ctx.fillRect(start[0], start[1], size[0], size[1]);
        // Render a rectangle on all landmarks
          for(let mark of predictions[i].landmarks){
          _ctx.strokeStyle = figment.toCanvasColor(colorIn.value);;
          _ctx.strokeRect(mark[0]-s, mark[1]-s, s*2, s*2);
        }
      }
    }

    window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
    window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _canvas);
    window.gl.bindTexture(window.gl.TEXTURE_2D, null);
    imageOut.set(_framebuffer);
  });
}

imageIn.onChange = detectFaces;
colorIn.onChange = detectFaces;
toggleIn.onChange = detectFaces;
sizeIn.onChange = detectFaces;
`;

ml.detectFaces = `// Detect faces in an image using FaceMesh
const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const contoursToggleIn = node.toggleIn('draw contours', true);
const contoursColorIn = node.colorIn('contours color', [255, 255, 255, 1]);
const contoursLineWidthIn = node.numberIn('contours line width', 1, { min: 0, max: 10, step: 0.1 });
const tesselationToggleIn = node.toggleIn('draw tesselation', false);
const tesselationColorIn = node.colorIn('tesselation color', [255, 255, 255, 1]);
const tesselationLineWidthIn = node.numberIn('tesselation line width', 1, { min: 0, max: 10, step: 0.1 });
const bboxToggleIn = node.toggleIn('draw bounding box', false);
const bboxColorIn = node.colorIn('bounding box color', [255, 255, 255, 1]);
const bboxLineWidthIn = node.numberIn('bounding box line width', 1, { min: 0, max: 10, step: 0.1 });
contoursColorIn.label = 'color';
tesselationColorIn.label = 'color';
bboxColorIn.label = 'color';
contoursLineWidthIn.label = 'line width';
tesselationLineWidthIn.label = 'line width';
bboxLineWidthIn.label = 'line width';

const imageOut = node.imageOut('out');

let _faceMesh, _canvas, _ctx, _framebuffer, _imageData, _results, _isProcessing;

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts([
    '/assets/mediapipe/drawing_utils.js',
    '/assets/mediapipe/face_mesh.js'
  ]);
  _faceMesh = new FaceMesh({locateFile: (file) => {
    return \`/assets/mediapipe/\${file\}\`;
  }});
  _faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    _faceMesh.onResults((results) => {
      _faceMesh.onResults(null);
      _isProcessing = false;
      resolve(results);
    });
    _faceMesh.send({ image });
  });
}

node.onRender = async () => {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_faceMesh) return;

  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }

  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  let result;
  if (imageIn.value._directImageHack) {
    _results = await _detect(imageIn.value._directImageHack);
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
    imageIn.value.unbind();
    _results = await _detect(_imageData);
  }
  drawResults();
};

function drawResults() {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.multiFaceLandmarks) {
    for (const landmarks of _results.multiFaceLandmarks) {
      if (contoursToggleIn.value) {
        drawConnectors(_ctx, landmarks, FACEMESH_CONTOURS, { color: figment.toCanvasColor(contoursColorIn.value), lineWidth: contoursLineWidthIn.value });
      }
      if (tesselationToggleIn.value) {
        drawConnectors(_ctx, landmarks, FACEMESH_TESSELATION, { color: figment.toCanvasColor(tesselationColorIn.value), lineWidth: tesselationLineWidthIn.value });
      }
      if (bboxToggleIn.value) {
        let minX, minY, maxX, maxY;
        for (let i = 0; i < landmarks.length; i++) {
          if (i === 0) {
            minX = maxX = landmarks[i].x;
            minY = maxY = landmarks[i].y;
          } else {
            minX = Math.min(minX, landmarks[i].x);
            minY = Math.min(minY, landmarks[i].y);
            maxX = Math.max(maxX, landmarks[i].x);
            maxY = Math.max(maxY, landmarks[i].y);
          }
        }
        _ctx.strokeStyle = figment.toCanvasColor(bboxColorIn.value);
        _ctx.lineWidth = bboxLineWidthIn.value;
        _ctx.strokeRect(minX * width, minY * height, (maxX - minX) * width, (maxY - minY) * height);
      }
      //drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#FF3030'});
    }
  }
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}

// imageIn.onChange = detectFaces;
// backgroundIn.onChange = drawResults;
// tesselationToggleIn.onChange = drawResults;
// tesselationColorIn.onChange = drawResults;
// tesselationLineWidthIn.onChange = drawResults;
// contoursToggleIn.onChange = drawResults;
// contoursColorIn.onChange = drawResults;
// contoursLineWidthIn.onChange = drawResults;
`;

ml.detectObjects = `// Detect objects in an image.
const imageIn = node.imageIn('in');
const drawingModeIn = node.selectIn('drawingMode', ['boxes', 'mask']);
const filterIn = node.stringIn('filter', '*');
const imageOut = node.imageOut('out');
const objectsOut = node.stringOut('objects');

let _model, _canvas, _ctx, _framebuffer;

node.onStart = async () => {
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer(1, 1);
  _model = await figment.loadModel('coco-ssd', 'cocoSsd');
};

function stringToColor(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return \`rgb(\${(hash & 0xFF0000) >> 16}, \${(hash & 0x00FF00) >> 8}, \${hash & 0x0000FF})\`;
}

const _classLabelCache = {};
const _cachingCanvas = document.createElement('canvas');
const _cachingCtx = _cachingCanvas.getContext('2d');
function drawClassLabel(ctx, className, classColor, x, y) {
  if (_classLabelCache[className]) {
    ctx.putImageData(_classLabelCache[className], x, y);
  } else {
    const textWidth = _cachingCtx.measureText(className).width;
    _cachingCtx.font = '12px sans-serif';
    _cachingCtx.fillStyle = classColor;
    _cachingCtx.fillRect(0, 0, textWidth + 10, 18);
    _cachingCtx.fillStyle = 'white';
    _cachingCtx.fillText(className, 2, 12);
    _classLabelCache[className] = _cachingCtx.getImageData(0, 0, textWidth + 10, 18);
    ctx.putImageData(_classLabelCache[className], x, y);
  }
}

node.onRender = async () => {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_model) return;
  if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
    _canvas.width = imageIn.value.width;
    _canvas.height = imageIn.value.height;
    _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  }

  const imageData = figment.framebufferToImageData(imageIn.value);
  const predictions = await _model.detect(imageData);
  let filteredPredictions = predictions;
  if (filterIn.value !== '*') {
    const filteredLabels = filterIn.value.split(',').map(s => s.trim());
    filteredPredictions = predictions.filter(prediction => filteredLabels.includes(prediction.class));
  }
  _ctx.lineWidth = 2;
  _ctx.font = '12px sans-serif';
  if (drawingModeIn.value === 'boxes') {
    _ctx.putImageData(imageData, 0, 0);
    for (const prediction of filteredPredictions) {
      const classColor = stringToColor(prediction.class);
      _ctx.strokeStyle = classColor;
      _ctx.strokeRect(prediction.bbox[0], prediction.bbox[1], prediction.bbox[2], prediction.bbox[3]);
      drawClassLabel(_ctx, prediction.class, classColor, prediction.bbox[0], prediction.bbox[1]);
    }
  } else if (drawingModeIn.value === 'mask') {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    for (const prediction of filteredPredictions) {
      const bbox = prediction.bbox;
      _ctx.putImageData(imageData, 0, 0, bbox[0], bbox[1], bbox[2], bbox[3]);
    }
  }

  // console.log('Predictions: ', predictions);
  window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
  objectsOut.set(predictions);
}

// imageIn.onChange = detectObjects;
`;

ml.detectPose = `// Detect human poses in input image.
const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });
const imageOut = node.imageOut('out');
pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _framebuffer, _pose, _canvas, _ctx, _imageData, _results, _isProcessing;

node.onStart = async (props) => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts([
    '/assets/mediapipe/drawing_utils.js',
    '/assets/mediapipe/pose.js'
  ]);
  const pose = new Pose({locateFile: (file) => {
    return \`/assets/mediapipe/\${file}\`;
  }});
  pose.setOptions({
    modelComplexity: 1, 
    smoothLandmarks: true,
  });
  await pose.initialize();
  _pose = pose;
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    _pose.onResults((results) => {
      _pose.onResults(null);
      _isProcessing = false;
      resolve(results);
    });
    _pose.send({ image });
  });
}

node.onRender = async () => {
  if (!imageIn.value) return;
  if (!_pose) return;
  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }
  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  if (imageIn.value._directImageHack) {
    _results = await _detect(imageIn.value._directImageHack);
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
    imageIn.value.unbind();
    _results = await _detect(_imageData);
  }
  drawResults();
};

function drawResults() {
  if (!imageIn.value || !_results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.poseLandmarks) {
    _ctx.fillStyle = 'white';
    _ctx.beginPath();
    if (linesToggleIn.value) {
      drawConnectors(_ctx, _results.poseLandmarks, POSE_CONNECTIONS, {color: figment.toCanvasColor(linesColorIn.value), lineWidth: linesWidthIn.value, visibilityMin: 0});
    }
    if (pointsToggleIn.value) {
      drawLandmarks(_ctx, _results.poseLandmarks, {color: figment.toCanvasColor(pointsColorIn.value), lineWidth: pointsRadiusIn.value});
    }
  }
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}
`;

ml.segmentPose = `// Remove the background from an image.

const imageIn = node.imageIn('in');
const operationIn = node.selectIn('remove', ['background', 'foreground']);
const imageOut = node.imageOut('out');

let _framebuffer, _canvas, _results, _pose, _imageData, _isProcessing;

node.onStart = async (props) => {
  console.log('ml.segmentPose start');
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts([
    '/assets/mediapipe/pose.js'
  ]);
  const pose = new Pose({locateFile: (file) => {
    return \`/assets/mediapipe/\${file}\`;
  }});
  pose.setOptions({
    modelComplexity: 1, 
    smoothLandmarks: true,
    enableSegmentation: true,
  });
  await pose.initialize();
  _pose = pose;
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    _pose.onResults((results) => {
      _pose.onResults(null);
      _isProcessing = false;
      resolve(results);
    });
    _pose.send({ image });
  });
}

node.onRender = async () => {
  if (!imageIn.value) return;
  if (!_pose) return;
  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }
  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  if (imageIn.value._directImageHack) {
    _results = await _detect(imageIn.value._directImageHack);
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
    imageIn.value.unbind();
    _results = await _detect(_imageData);
  }
  drawResults();
};

function drawResults() {
  if (!imageIn.value || !_results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _ctx.save();
  _ctx.globalCompositeOperation = 'source-over';
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  if (_results.segmentationMask) {
    if (operationIn.value === 'background') {
      // Draw the segmentation mask.
      _ctx.drawImage(_results.segmentationMask, 0, 0);

      // Only overwrite existing pixels (i.e. the mask) with the image.
      _ctx.globalCompositeOperation = 'source-in';
      _ctx.drawImage(_results.image, 0, 0);
    } else {
      // Fill the destination.
      _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

      // Draw everything outside of the segmentation mask.
      _ctx.globalCompositeOperation = 'destination-out';
      _ctx.drawImage(_results.segmentationMask, 0, 0);

      // Overwrite the existing pixels (i.e. the background) with the image.
      _ctx.globalCompositeOperation = 'source-in';
      _ctx.drawImage(_results.image, 0, 0);
    }
  }
  _ctx.restore();
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}
`;

ml.segmentPose2 = `// Remove the background from an image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform sampler2D u_segment_texture;
uniform int u_drawing_mode;
varying vec2 v_uv;

void main() {
  vec4 segment = texture2D(u_segment_texture, v_uv);
  if (segment.r >= 0.001) {
    if (u_drawing_mode == 0) { // Draw masked image
      gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else if (u_drawing_mode == 1) { // Draw mask
      gl_FragColor = texture2D(u_input_texture, v_uv);
    }
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
}
\`;


const imageIn = node.imageIn('in');
const drawingModeIn = node.selectIn('drawingMode', ['image', 'mask']);
const imageOut = node.imageOut('out');

let _model, _canvas, _ctx, _framebuffer, _program, _segmentTexture, _segmentBuffer;

node.onStart = async () => {
  _program = figment.createShaderProgram(fragmentShader);
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer(1, 1);
  _model = await figment.loadModel('body-pix', 'bodyPix');
  _segmentTexture = twgl.createTexture(window.gl, { width: 640, height: 480, format: gl.RED, type: gl.UNSIGNED_BYTE });
  _segmentBuffer = new Uint8Array(640 * 480);
};

async function segmentPersons() {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_model) return;
  if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
    _canvas.width = imageIn.value.width;
    _canvas.height = imageIn.value.height;
    _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  }

  const imageDataIn = figment.framebufferToImageData(imageIn.value);
  const segmentation = await _model.segmentMultiPerson(imageDataIn, {});
  // const imageDataOut = new ImageData(640, 480);

  _segmentBuffer.fill(0);
  for (const segment of segmentation) {
    const buffer = segment.data;
    for (let i = 0, l = buffer.length; i < l; i++) {
      if (buffer[i] === 0) continue;
      _segmentBuffer[i] = buffer[i];
    }
  }
  twgl.setTextureFromArray(window.gl, _segmentTexture, _segmentBuffer, { width: 640, height: 480, format: window.gl.LUMINANCE });
  _framebuffer.bind();
  figment.clear();
  figment.drawQuad(_program, {
    u_input_texture: imageIn.value.texture,
    u_segment_texture: _segmentTexture,
    u_drawing_mode: drawingModeIn.value === 'image' ? 0 : 1,
  });
  _framebuffer.unbind();

  imageOut.set(_framebuffer);
}

imageIn.onChange = segmentPersons;
`;

ml.imageToImageModel = `// Run a generative image to image model (pix2pix).
const imageIn = node.imageIn('in');
const modelDir = node.directoryIn('model');
const imageOut = node.imageOut('out');

let oldModelDir, model, canvas, framebuffer;

node.onStart = () => {
  canvas = new OffscreenCanvas(512, 512);
  framebuffer = new figment.Framebuffer(512, 512);
};

async function loadModel() {
  if (!modelDir.value) return;
  const modelUrl = figment.urlForAsset(modelDir.value + "/model.json");
  model = await tf.loadGraphModel(modelUrl);
  oldModelDir = modelDir.value;
}

node.onRender = async () => {
  if (oldModelDir !== modelDir.value) {
    await loadModel();
  }
  if (!model) return;
  if (!imageIn.value) return;
  if (imageIn.value.width !== 512 || imageIn.value.height !== 512) {
    throw new Error('Image must be 512x512');
  }

  const imageData = figment.framebufferToImageData(imageIn.value);
  const inputTensor = tf.tidy(() => {
    let tensor = tf.expandDims(tf.browser.fromPixels(imageData), 0);
    // Normalize values between -1 and 1
    tensor = tensor.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));
    return tensor;
  });
  
  // Execute the model
  let outputTensor = await model.execute(inputTensor);

  const result = tf.tidy(() => {
    // Convert results back to 0-1 range
    return outputTensor.mul(tf.scalar(0.5)).add(tf.scalar(0.5)).squeeze();
  })
  
  await tf.browser.toPixels(result, canvas);
  figment.canvasToFramebuffer(canvas, framebuffer);

  inputTensor.dispose();
  outputTensor.dispose();
  result.dispose();

  imageOut.set(framebuffer);
};
`;

export default { image, ml };
