import { m4 } from 'twgl.js';
window.m4 = m4;

export const core = {};
export const image = {};
export const ml = {};

////////////////////////////////////////////////////////////////////////////////
//// CORE OPERATIONS ///////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

core.out = `// Signifies that this is the output of the network.
const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

imageIn.onChange = () => imageOut.set(imageIn.value);
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

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: blurIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
blurIn.onChange = render;
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
  render();
}

let program, framebuffer;

node.onStart = (props) => {
  updateShader();
  framebuffer = new figment.Framebuffer();
}

function render() {
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
}

image1In.onChange = render;
image2In.onChange = render;
factorIn.onChange = render;
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

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

function render() {
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255, colorIn.value[3]]
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

colorIn.onChange = render;
widthIn.onChange = render;
heightIn.onChange = render;
`;

image.crop = `// Crop input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
uniform vec2 u_offset;
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
      gl_FragColor = texColor;
      // gl_FragColor = u_color * texture2D(u_input_texture, uv);
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
      gl_FragColor = texColor;
     // gl_FragColor = u_color * texture2D(u_input_texture, uv);
    }
  }
}
\`;

const imageIn = node.imageIn('in');
const offsetXIn = node.numberIn('offsetX', 50.0, { min: 1, max: 4096, step: 1 });
const offsetYIn = node.numberIn('offsetY', 50.0, { min: 1, max: 4096, step: 1 });
const widthIn = node.numberIn('width', 512.0, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512.0, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_offset: [offsetXIn.value, offsetYIn.value],
    u_output_size: [widthIn.value, heightIn.value]});
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
widthIn.onChange = render;
heightIn.onChange = render;
offsetXIn.onChange = render;
offsetYIn.onChange = render;
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

function render() {
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
}

imageIn.onChange = render;
embossWidthIn.onChange = render;
embossHeightIn.onChange = render;
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

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();  
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
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

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
`;

image.levels = `// Change brightness - contrast - saturation on input image.

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

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
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
}

imageIn.onChange = render;
brightnessIn.onChange = render;
contrastIn.onChange = render;
saturationIn.onChange = render;
`;

image.loadImage = `// Load an image from a file.

const fileIn = node.fileIn('file', '', { fileType: 'image' });
const imageOut = node.imageOut('out');

let texture, framebuffer, program;

node.onStart = () => {
  program = figment.createShaderProgram();
  framebuffer = new figment.Framebuffer();
}

function loadImage() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  figment.createTextureFromUrl(imageUrl.toString(), onLoad);
}

function onLoad(err, texture, image) {
  if (err) {
    throw new Error(\`Image load error: \${err\}\`);
  }
  framebuffer.setSize(image.naturalWidth, image.naturalHeight);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_image: texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

function onError(err) {
  console.error('image.loadImage error', err);
}

fileIn.onChange = loadImage;
`;

image.loadImageFolder = `// Load a folder of images.

const folderIn = node.directoryIn('folder', '');
const filterIn = node.stringIn('filter', '*.jpg');
const animateIn = node.toggleIn('animate', false);
const frameRateIn = node.numberIn('frameRate', 10, { min: 1, max: 60 });
const imageOut = node.imageOut('out');

let files, fileIndex, texture, framebuffer, program, timerHandle;

node.onStart = () => {
  program = figment.createShaderProgram();
  framebuffer = new figment.Framebuffer();
  fileIndex = 0;
}

function loadDirectory() {
  if (!folderIn.value || folderIn.value.trim().length === 0) return;
  window.desktop.globFiles(folderIn.value, filterIn.value, onLoadDirectory);
}

function onLoadDirectory(err, _files) {
  files = _files;
  if (err) {
    console.error(err);
    onLoadError();
    return;
  }
  if (files.length === 0) {
    onLoadError();
    return;
  }
  fileIndex = -1;
  nextImage();
}

function onLoadError() {
  const texture = figment.createErrorTexture();
  framebuffer.setSize(100, 56);
  framebuffer.bind();
  figment.drawQuad(program, { u_image: texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

function onLoadImage(err, texture, image) {
  if (err) {
    throw new Error(\`Image load error: \${err\}\`);
  }
  framebuffer.setSize(image.naturalWidth, image.naturalHeight);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_image: texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

function nextImage() {
  fileIndex++;
  if (fileIndex >= files.length) {
    fileIndex = 0;
  }
  if (texture) {
    window.gl.deleteTexture(texture);
  }

  const file = files[fileIndex];
  const imageUrl = figment.urlForAsset(file);
  figment.createTextureFromUrl(imageUrl.toString(), onLoadImage);
}

function toggleAnimate() {
  if (animateIn.value) {
    timerHandle = window.setInterval(nextImage, 1000 / frameRateIn.value);
  } else {
    window.clearInterval(timerHandle);
  }
}

function changeFrameRate() {
  window.clearInterval(timerHandle);
  if (animateIn.value) {
   timerHandle = window.setInterval(nextImage, 1000 / frameRateIn.value);
  }
}

folderIn.onChange = loadDirectory;
filterIn.onChange = loadDirectory;
animateIn.onChange = toggleAnimate;
frameRateIn.onChange = changeFrameRate;
`;

image.loadMovie = `// Load a movie file.

const fileIn = node.fileIn('file', '', { fileType: 'movie' });
const animateIn = node.toggleIn('animate', true);
const speedIn = node.numberIn('speed', 1, { min: 0.0, max: 10, step: 0.1 });
const restartIn = node.triggerButtonIn('restart');
const imageOut = node.imageOut('out');

let framebuffer, program, video, timerHandle, videoReady = false;

node.onStart = () => {
  framebuffer = new figment.Framebuffer();
}

function loadMovie() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  clearInterval(timerHandle);
  videoReady = false;
  video = document.createElement('video');
  const fileUrl = figment.urlForAsset(fileIn.value);
  video.src = fileUrl;
  video.loop = true;
  video.autoplay = animateIn.value;
  video.muted = true;
  video.playbackRate = speedIn.value;
  video.addEventListener('canplay', () => {
    videoReady = true;
    framebuffer.setSize(video.videoWidth, video.videoHeight);
  });
}

node.onFrame = () => {
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
}

node.onStop = () => {
  clearInterval(timerHandle);
  if (video) {
    video.pause();
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
fileIn.onChange = loadMovie;
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
  render();
}

function render() {
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
}

sourceIn.onChange = render;
lookupIn.onChange = render;
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

function render() {
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

imageIn.onChange = render;
pivotXIn.onChange = render;
pivotYIn.onChange = render;
angleIn.onChange = render;
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

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
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
}

imageIn.onChange = render;
redIn.onChange = render;
greenIn.onChange = render;
blueIn.onChange = render;
`;

image.null = `// Does nothing.
const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

imageIn.onChange = () => imageOut.set(imageIn.value);
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

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, _pixels: [pixelsX.value, pixelsY.value] });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
pixelsX.onChange = render;
pixelsY.onChange = render;
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

function render() {
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
}

imageIn.onChange = render;
widthIn.onChange = render;
heightIn.onChange = render;
fitIn.onChange = render;
backgroundIn.onChange = render;
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
const sharpenIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001});
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: sharpenIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
sharpenIn.onChange = render;
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

function render() {
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
}

imageIn.onChange = render;
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

function render() {
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
}

imageIn1.onChange = render;
imageIn2.onChange = render;
directionIn.onChange = render;
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

function render() {
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
}

imageIn.onChange = render;
thresholdIn.onChange = render;
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

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

function clear() {
  framebuffer.bind();
  figment.clear();
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
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
const translateXIn = node.numberIn('translateX', 0, { min: -1, max: 1, step: 0.01 });
const translateYIn = node.numberIn('translateY', 0, { min: -1, max: 1, step: 0.01 });
const scaleXIn = node.numberIn('scaleX', 1, { min: -10, max: 10, step: 0.01 });
const scaleYIn = node.numberIn('scaleY', 1, { min: -10, max: 10, step: 0.01 });
const rotateIn = node.numberIn('rotate', 0.0, { min: -360, max: 360, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(vertexShader, fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
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
}

imageIn.onChange = render;
translateXIn.onChange = render;
translateYIn.onChange = render;
scaleXIn.onChange = render;
scaleYIn.onChange = render;
rotateIn.onChange = render;
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

function render() {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_radius: radiusIn.value,u_twist: twistIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
radiusIn.onChange = render;
twistIn.onChange = render;
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

let _texture, framebuffer, program;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
}

function loadImage() {
  if (!queryIn.value || queryIn.value.trim().length === 0) return;
  const url = \`https://source.unsplash.com/\${widthIn.value}x\${heightIn.value}?\${queryIn.value}\`;
  figment.createTextureFromUrl(url, onLoad);
}

function onLoad(err, texture, image) {
  if (err) {
    throw new Error(\`Image load error: \${err\}\`);
  }
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
}

queryIn.onChange = figment.debounce(loadImage, 500);
widthIn.onChange = figment.debounce(loadImage, 500);
heightIn.onChange = figment.debounce(loadImage, 500);
`;

image.webcamImage = `// Return a webcam stream

const frameRate = node.numberIn('frameRate', 30);
const imageOut = node.imageOut('image');

let _video, _stream, _timer, _framebuffer;

node.onStart = () => {
  navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  }).then(function(stream) {
    _video = document.createElement('video');
    _video.width = 640;
    _video.height = 480;
    _video.srcObject = stream;
    _video.play();
    _stream = stream;
    _framebuffer = new figment.Framebuffer(_video.width, _video.height);
    _timer = setInterval(uploadImage, 1000 / frameRate.value);
  })
  .catch(function(err) {
    console.error('no camera input!', err.name);
  });
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream && _stream.active) {
    _stream.getTracks().forEach(track => track.stop())
    _video = null;
  }
}

function uploadImage() {
  if (!_video || !_framebuffer) return;
  if (_video.readyState !== _video.HAVE_ENOUGH_DATA) return;
  _framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(uploadImage, 1000 / frameRate.value);
}
`;

////////////////////////////////////////////////////////////////////////////////
//// MACHINE LEARNING //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

ml.detectObjects = `// Detect objects in an image.
const imageIn = node.imageIn('in');
const imageOut = node.imageOut('image');
const objectsOut = node.stringOut('objects');

let _model, _canvas, _ctx, _framebuffer;

node.onStart = async () => {
  console.log('start')
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer();
  _model = await figment.loadModel('coco-ssd');
};

function stringToColor(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return \`rgb(\${(hash & 0xFF0000) >> 16}, \${(hash & 0x00FF00) >> 8}, \${hash & 0x0000FF})\`;
}

function detectObjects() {
  if (!imageIn.value) return;
  if (!_model) return;
  const imageData = figment.framebufferToImageData(imageIn.value);
  _model.detect(imageData).then(predictions => {
    _ctx.lineWidth = 2;
    _ctx.font = '12px sans-serif';
    _ctx.putImageData(imageData, 0, 0);
    for (const prediction of predictions) {
      if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
        _canvas.width = imageIn.value.width;
        _canvas.height = imageIn.value.height;
        _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
      }
      const classColor = stringToColor(prediction.class);
      _ctx.strokeStyle = classColor;
      _ctx.strokeRect(prediction.bbox[0], prediction.bbox[1], prediction.bbox[2], prediction.bbox[3]);
      _ctx.fillStyle = classColor;
      const textWidth = _ctx.measureText(prediction.class).width;
      _ctx.fillRect(prediction.bbox[0], prediction.bbox[1], textWidth + 10, 18);
      _ctx.fillStyle = 'white';
      _ctx.fillText(prediction.class, prediction.bbox[0] + 2, prediction.bbox[1] + 12);
    }
    // console.log('Predictions: ', predictions);
    window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
    window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _canvas);
    window.gl.bindTexture(window.gl.TEXTURE_2D, null);
    imageOut.set(_framebuffer);
  });
}

imageIn.onChange = detectObjects;
`;

ml.detectPose = `// Detect human poses in input image.
const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const radiusIn = node.numberIn('radius', 5, { min: 0, max: 10, step: 0.1 });
const imageOut = node.imageOut('out');

let program, framebuffer, pose, canvas, ctx, data, results;

node.onStart = (props) => {
  framebuffer = new figment.Framebuffer();
  canvas = new OffscreenCanvas(1, 1);
  ctx = canvas.getContext('2d');
  const _pose = new Pose({locateFile: (file) => {
    return \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`;
  }});
  _pose.setOptions({
    modelComplexity: 1, 
    smoothLandmarks: true,
  });
  _pose.onResults(onResults);
  _pose.initialize().then(() => {
    pose = _pose;
  });
};

function detectPose() {
  if (!imageIn.value) return;
  if (!pose) return;
  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== canvas.width || height !== canvas.height) {
    canvas.width = width;
    canvas.height = height;
    data = new ImageData(width, height);
    framebuffer.setSize(width, height);
  }
  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  if (imageIn.value._directImageHack) {
    pose.send({ image: imageIn.value._directImageHack });
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
    imageIn.value.unbind();
    pose.send({ image: data });
  }
}

function onResults(_results) {
  results = _results;
  drawResults();
}

function drawResults() {
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  ctx.fillRect(0, 0, width, height);
  if (results.poseLandmarks) {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    let radius = radiusIn.value;
    for (let i = 0; i < results.poseLandmarks.length; i++) {
      const landmark = results.poseLandmarks[i];
      let { x, y } = landmark;
      ctx.moveTo(x * width + radius, y * height);
      ctx.arc(x * width, y * height, radius, 0, 2 * Math.PI);
    }
    ctx.fill();
  }
  window.gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(framebuffer);
}

imageIn.onChange = detectPose;
backgroundIn.onChange = drawResults;
radiusIn.onChange = drawResults;
`;

ml.segmentPose = `// Remove the background from an image.

const imageIn = node.imageIn('in');
const operationIn = node.selectIn('remove', ['background', 'foreground']);
const imageOut = node.imageOut('out');

let program, framebuffer, canvas, results, pose;

node.onStart = (props) => {
  framebuffer = new figment.Framebuffer();
  canvas = new OffscreenCanvas(1, 1);
  ctx = canvas.getContext('2d');
  const _pose = new Pose({locateFile: (file) => {
    return \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`;
  }});
  _pose.setOptions({
    modelComplexity: 1, 
    smoothLandmarks: true,
    enableSegmentation: true,
  });
  _pose.onResults(onResults);
  _pose.initialize().then(() => {
    pose = _pose;
  });
};


function segmentBackground() {
  if (!imageIn.value) return;
  if (!pose) return;
  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== canvas.width || height !== canvas.height) {
    canvas.width = width;
    canvas.height = height;
    data = new ImageData(width, height);
    framebuffer.setSize(width, height);
  }
  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  if (imageIn.value._directImageHack) {
    pose.send({ image: imageIn.value._directImageHack });
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
    imageIn.value.unbind();
    pose.send({ image: data });
  }
}

function onResults(_results) {
  results = _results;
  drawResults();
}

function drawResults() {
  if (!results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (results.segmentationMask) {
    if (operationIn.value === 'background') {
      // Draw the segmentation mask.
      ctx.drawImage(results.segmentationMask, 0, 0);

      // Only overwrite existing pixels (i.e. the mask) with the image.
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(results.image, 0, 0);
    } else {
      // Fill the destination.
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw everything outside of the segmentation mask.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(results.segmentationMask, 0, 0);

      // Overwrite the existing pixels (i.e. the background) with the image.
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(results.image, 0, 0);
    }
  }
  ctx.restore();
  window.gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(framebuffer);
}

imageIn.onChange = segmentBackground;
`;

export default { image, ml };
