import { Pose } from '@mediapipe/pose';
window.Pose = Pose;

export const image = {};
export const ml = {};

image.loadImage = `// Load an image from a file.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
\`;

const fileIn = node.fileIn('file', '');
const imageOut = node.imageOut('out');

let texture, framebuffer, program;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
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

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
\`;

const folderIn = node.directoryIn('folder', 'examples/assets/waves');
const filterIn = node.stringIn('filter', '*.jpg');
const animateIn = node.toggleIn('animate', false);
const frameRateIn = node.numberIn('frameRate', 10, { min: 1, max: 60 });
const imageOut = node.imageOut('out');

let files, fileIndex, texture, framebuffer, program, timerHandle;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
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

image.camImage = `// Return a webcam stream

const frameRate = node.numberIn('frameRate', 10);
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
    // uploadImage();
  })
  .catch(function(err) {
    console.error('no camera input!', err);
  });
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream.active) {
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

// node.debugDraw = (ctx) => {
//   if (imageOut.value) {
//     ctx.drawImage(imageOut.value, 0, 0, 100, 75);
//   }
// }
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
  figment.drawQuad(program, { u_image: texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

queryIn.onChange = figment.debounce(loadImage, 300);
widthIn.onChange = figment.debounce(loadImage, 300);
heightIn.onChange = figment.debounce(loadImage, 300);
`;

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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: blurIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
blurIn.onChange = render;
`;

image.constant = `// Render a constant color.

const fragmentShader = \`
precision mediump float;
uniform vec3 u_color; // R/G/B color
uniform float u_alpha;
varying vec2 v_uv;
void main() {
  gl_FragColor = vec4(u_color, u_alpha);
}
\`;

const colorIn = node.colorIn('color');
const alphaIn = node.numberIn('alpha', 1.0, { min: 0, max: 1, step: 0.01});
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
  figment.drawQuad(program, {
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
    u_alpha: alphaIn.value
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

colorIn.onChange = render;
alphaIn.onChange = render;
widthIn.onChange = render;
heightIn.onChange = render;
`;

image.crop = `// Crop input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec2 u_offset;
uniform vec2 u_output_size;
uniform vec2 u_input_size;
varying vec2 v_uv;

vec4 cropImage(sampler2D img, vec2 texCoord) {
  if (texCoord.x < u_offset.x/u_input_size.x || 
    texCoord.x > ((u_offset.x+u_output_size.x)/u_input_size.x) || 
    texCoord.y < u_offset.y/u_input_size.y || 
    texCoord.y > ((u_offset.y+u_output_size.y)/u_input_size.y)) {
    discard;
    //return vec4(0);
  }
  return texture2D(img, texCoord);
}

void main() {
  vec2 uv = v_uv;
  vec4 texColor=texture2D(u_input_texture,uv);
  texColor = cropImage(u_input_texture,uv);
  gl_FragColor = texColor;
}
\`;

const imageIn = node.imageIn('in');
const offsetXIn = node.numberIn('offsetX', 50.0, { min: 1, max: 4096, step: 1 });
const offsetYIn = node.numberIn('offsetX', 50.0, { min: 1, max: 4096, step: 1 });
const widthIn = node.numberIn('width', 256.0, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 256.0, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_offset: [offsetXIn.value, offsetYIn.value],
    u_output_size: [widthIn.value, heightIn.value],
    u_input_size: [imageIn.value.width, imageIn.value.height]});
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  const r = angleIn.value * Math.PI / 180;
  const x = Math.sin(r);
  const y = -Math.cos(r);
  const z = -((pivotXIn.value * x * imageIn.value.width) + (pivotYIn.value * y * imageIn.value.height));

  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, _pixels: [pixelsX.value, pixelsY.value] });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
pixelsX.onChange = render;
pixelsY.onChange = render;
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
uniform float u_mode;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  if(u_mode==0.0){
  vec4 color1 = texture2D(u_input_texture_1, vec2(uv.x*2.0, uv.y));
  vec4 color2 = texture2D(u_input_texture_2, vec2(uv.x*2.0-1.0, uv.y));
  gl_FragColor = uv.x < 0.5 ? color1 : color2;
}else{
  vec4 color1 = texture2D(u_input_texture_1, vec2(uv.x, uv.y*2.0));
  vec4 color2 = texture2D(u_input_texture_2, vec2(uv.x, uv.y*2.0-1.0));
  gl_FragColor = uv.y < 0.5 ? color1 : color2;
}
}
\`;

const imageIn1 = node.imageIn('image 1');
const imageIn2 = node.imageIn('image 2');
const modeIn = node.selectIn('Direction', ['Horizontal', 'Vertical']);
const imageOut = node.imageOut('out');

let program, framebuffer,m;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn1.value || !imageIn2.value) return;
  if (!program) return;
  if (!framebuffer) return;
  console.log(modeIn.value);
  if(modeIn.value === 'Horizontal'){
  m = 0;
  framebuffer.setSize(imageIn1.value.width+imageIn2.value.width, imageIn1.value.height);
}else{
  m = 1;
  framebuffer.setSize(imageIn1.value.width, imageIn1.value.height+imageIn2.value.height);
}
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture_1: imageIn1.value.texture,u_input_texture_2: imageIn2.value.texture,u_mode: m });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn1.onChange = render;
imageIn2.onChange = render;
modeIn.onChange = render;
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

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
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
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_radius: radiusIn.value,u_twist: twistIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
radiusIn.onChange = render;
twistIn.onChange = render;
`;

ml.detectPose = `// Detect human poses in input image.
const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let program, framebuffer, pose, canvas, ctx;

node.onStart = (props) => {
  // program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
  pose = new Pose({locateFile: (file) => {
    return \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`;
  }});
  pose.setOptions({
    modelComplexity: 1, 
    smoothLandmarks: true,
  });
  pose.onResults(onResults);
  canvas = new OffscreenCanvas(1, 1);
  ctx = canvas.getContext('2d');
};

function detectPose() {
  if (!imageIn.value) return;
  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== canvas.width || height !== canvas.height) {
    canvas.width = width;
    canvas.height = height;
    data = new ImageData(width, height);
    framebuffer.setSize(width, height);
  }
  imageIn.value.bind();
  window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
  imageIn.value.unbind();
  pose.send({ image: data });
}

function onResults(results) {
  imageOut.set(framebuffer);
  if (!results.poseLandmarks) return;
  const landmarks = results.poseLandmarks;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < landmarks.length; i++) {
    const landmark = landmarks[i];
    let { x, y } = landmark;
    ctx.moveTo(x * width + 10, y * height);
    ctx.arc(x * width, y * height, 10, 0, 2 * Math.PI);
  }
  ctx.fill();
  ctx.stroke();
  window.gl.bindTexture(gl.TEXTURE_2D, imageOut.value.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(framebuffer);
}

imageIn.onChange = detectPose;
`;

export default { image, ml };
