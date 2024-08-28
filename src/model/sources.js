import * as twgl from 'twgl.js';
import { m4 } from 'twgl.js';
window.m4 = m4;
window.twgl = twgl;

export const core = {};
export const comms = {};
export const image = {};
export const ml = {};

const ASSETS_PATH = import.meta.env.DEV ? 'assets' : '.';

////////////////////////////////////////////////////////////////////////////////
//// CORE OPERATIONS ///////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

core.out = `// Signifies that this is the output of the network.
const imageIn = node.imageIn('in');
const statsIn = node.toggleIn('show stats', false);
const imageOut = node.imageOut('out');

node.onRender = () => {
  imageOut.set(imageIn.value);
}

statsIn.onChange = () => {
    if (statsIn.value) {
        document.body.appendChild(window.stats.dom);
    } else {
        document.body.removeChild(window.stats.dom);
    }
}
`;

////////////////////////////////////////////////////////////////////////////////
//// COMMUNICATION OPERATIONS //////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

comms.sendOsc = `// Send an OSC message.
const triggerIn = node.triggerIn('trigger');
const ipIn = node.stringIn('ip', '127.0.0.1');
const portIn = node.numberIn('port', 8000, { min: 0, max: 65535 });
const addressIn = node.stringIn('address', '/test');
const arg1In = node.numberIn('argument1', 0);
const arg2In = node.numberIn('argument2', 0);
const arg3In = node.numberIn('argument3', 0);
const triggerOut = node.triggerOut('trigger');
arg1In.display = 0x03;
arg2In.display = 0x03;
arg3In.display = 0x03;
triggerOut.display = 0x02;

node.onRender = () => {
  _sendMessage();
};

const _sendMessage = () => {
  const ip = ipIn.value;
  const port = portIn.value;
  const address = addressIn.value;
  const args = [arg1In.value, arg2In.value, arg3In.value];
  window.desktop.oscSendMessage(ip, port, address, args);
  triggerOut.trigger();
};

arg1In.onChange = _sendMessage;
arg2In.onChange = _sendMessage;
arg3In.onChange = _sendMessage;
`;

////////////////////////////////////////////////////////////////////////////////
//// IMAGE OPERATIONS //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

image.ascii = `// Ascii effect on image.
// https://www.shadertoy.com/view/4sSBDK

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_detail;
uniform float u_pixels;
uniform vec2 u_resolution;
uniform float u_color;
varying vec2 v_uv;

float ASCII_Details = u_detail;
float PixelSize = u_pixels;
float grayScale(in vec3 col)
{
    return dot(col, vec3(0.2126, 0.7152, 0.0722)); //sRGB
}

float character(float n, vec2 p)
{
	p = floor(p*vec2(4.0, -4.0) + 2.5);
	if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y
	 && int(mod(n/exp2(p.x + 5.0*p.y), 2.0)) == 1) return 1.0;
	return 0.0;
}

void main() {
  vec2 uv = v_uv* u_resolution.xy;
	vec3 col = texture2D(u_input_texture, floor(uv / ASCII_Details) * ASCII_Details / u_resolution.xy).rgb;
	float gray = grayScale(col);
    float n = 65536.0 +
              step(0.2, gray) * 64.0 +
              step(0.3, gray) * 267172.0 +
        	  step(0.4, gray) * 14922314.0 +
        	  step(0.5, gray) * 8130078.0 -
        	  step(0.6, gray) * 8133150.0 -
        	  step(0.7, gray) * 2052562.0 -
        	  step(0.8, gray) * 1686642.0;

	vec2 p = mod(uv / PixelSize, 2.0) - vec2(.1);

  if(u_color==0.0){
    col = col*character(n, p);
  }else{
    col = gray * vec3(character(n, p));
  }
	gl_FragColor = vec4(col, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const detailIn = node.numberIn('detail', 20.0, { min: 2, max: 50.0, step: 1 });
const pixelsIn = node.numberIn('pixel size', 4.5, { min: 1.0, max: 50.0, step: 0.5 });
const colorIn = node.selectIn('Color', ['Color', 'Gray']);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  let u_color;
  if (colorIn.value === 'Color') {
    u_color = 0.0;
  } else {
    u_color = 1.0;
  }
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_detail: detailIn.value,
    u_pixels: pixelsIn.value,
    u_color,
  u_resolution:[imageIn.value.width, imageIn.value.height] });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.barrelDistortion = `// Barrel distortion on image.

const fragmentShader = \`
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
\`;

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
    u_radius: rad.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.bleachBypass = `// Bleach bypass shader

const fragmentShader = \`
// Bleach bypass shader [http://en.wikipedia.org/wiki/Bleach_bypass]
// based on Nvidia example
// http://developer.download.nvidia.com/shaderlibrary/webpages/shader_library.html#post_bleach_bypass
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_opacity;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 base = texture2D( u_input_texture, uv );

  vec3 lumCoeff = vec3( 0.25, 0.65, 0.1 );
  float lum = dot( lumCoeff, base.rgb );
  vec3 blend = vec3( lum );
  float L = min( 1.0, max( 0.0, 10.0 * ( lum - 0.45 ) ) );

  vec3 result1 = 2.0 * base.rgb * blend;
  vec3 result2 = 1.0 - 2.0 * ( 1.0 - blend ) * ( 1.0 - base.rgb );

  vec3 newColor = mix( result1, result2, L );
  float A2 = u_opacity * base.a;
  vec3 mixRGB = A2 * newColor.rgb;
  mixRGB += ( ( 1.0 - A2 ) * base.rgb );
  gl_FragColor = vec4( mixRGB, base.a );
}
\`;

const imageIn = node.imageIn('in');
const opacityIn = node.numberIn('opacity', 1.0, { min: 0.0, max: 2.0, step: 0.01});
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
  u_opacity: opacityIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.blur = `// Blur an input image

const fragmentShader = \`
precision mediump float;

uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;

#define BOT 1.0 - u_step
#define TOP 1.0 + u_step
#define CEN 1.0

void main() {
  vec2 uv = v_uv;

  gl_FragColor =
    texture2D(u_input_texture, uv + vec2(-u_step, -u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(-u_step, 0.0)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(-u_step, u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(0.0, -u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(0.0, 0.0)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(0.0, u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(u_step, -u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(u_step, 0.0)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(u_step, u_step)) / 8.0;
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

image.brannan = `// Brannan instagram filter on image.
//https://www.shadertoy.com/view/4lSyDK

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_gray;
uniform float u_saturation;
varying vec2 v_uv;

// Overlay function to blend two values using the overlay blend mode
float overlay(in float s, in float d )
{
	return (d < 0.5) ? 2.0 * s * d : 1.0 - 2.0 * (1.0 - s) * (1.0 - d);
}

// Overload overlay function to apply it to each RGB component separately
vec3 overlay(in vec3 s, in vec3 d )
{
	vec3 c;
	c.x = overlay(s.x,d.x);
	c.y = overlay(s.y,d.y);
	c.z = overlay(s.z,d.z);
	return c;
}

// Function to convert RGB color to grayscale
float grayScale(in vec3 col)
{
    return dot(col, vec3(0.3, 0.59, 0.11));
}

// Function to create a saturation matrix based on a given saturation value
mat3 saturationMatrix( float saturation ) {
    vec3 luminance = vec3( 0.3086, 0.6094, 0.0820 );
    float oneMinusSat = 1.0 - saturation;
    vec3 red = vec3( luminance.x * oneMinusSat );
    red.r += saturation;
    vec3 green = vec3( luminance.y * oneMinusSat );
    green.g += saturation;
    vec3 blue = vec3( luminance.z * oneMinusSat );
    blue.b += saturation;

    return mat3(red, green, blue);
}

void levels(inout vec3 col, in vec3 inleft, in vec3 inright, in vec3 outleft, in vec3 outright) {
    col = clamp(col, inleft, inright);
    col = (col - inleft) / (inright - inleft);
    col = outleft + col * (outright - outleft);
}

void brightnessAdjust( inout vec3 color, in float b) {
    color += b;
}

void contrastAdjust( inout vec3 color, in float c) {
    float t = 0.5 - c * 0.5;
    color = color * c + t;
}

void main()
{
	vec2 uv = v_uv;
    vec3 col = texture2D(u_input_texture, uv).rgb;
    vec3 gray = vec3(grayScale(col));
    col = saturationMatrix(u_saturation) * col;
    gray = overlay(gray, col);
    col = mix(gray, col, u_gray);
    levels(col, vec3(0., 0., 0.) / 255., vec3(228., 255., 239.) / 255.,
                vec3(23., 3., 12.) / 255., vec3(255.) / 255.);
    brightnessAdjust(col, -0.1);
    contrastAdjust(col, 1.05);
    vec3 tint = vec3(255., 248., 242.) / 255.;
    levels(col, vec3(0., 0., 0.) / 255., vec3(255., 224., 255.) / 255.,
                 vec3(9., 20., 18.) / 255., vec3(255.) / 255.);
    col = pow(col, vec3(0.91, 0.91, 0.91*0.94));
    brightnessAdjust(col, -0.04);
    contrastAdjust(col, 1.14);
    col = tint * col;
	gl_FragColor = vec4(col, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const grayRatio = node.numberIn('grayscale ratio', 0.6, { min: 0, max: 1.0, step: 0.01 });
const satRatio = node.numberIn('saturation ratio', 0.7, { min: 0.0, max: 1.0, step: 0.01 });
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
    u_gray: grayRatio.value,
    u_saturation: satRatio.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.canny = `// Canny edge detection on input image.

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

image.cartoon = `// Render cartoon like image.
// demo: https://www.shadertoy.com/view/MslfWj // Ruofei Du

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_num;
varying vec2 v_uv;

const mat3 rgb2yuv_mat = mat3(
  0.2126,    0.7152,   0.0722,
 -0.09991,  -0.33609,  0.436,
  0.615,    -0.55861, -0.05639
);

const mat3 yuv2rgb_mat = mat3(
  1.0,  0.0,      1.28033,
  1.0, -0.21482, -0.38059,
  1.0,  2.12798,  0.0
);

vec3 rgb2yuv(vec3 rgb) {
  return rgb * rgb2yuv_mat;
}

vec3 yuv2rgb(vec3 rgb) {
  return rgb * yuv2rgb_mat;
}

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  vec3 yuv = rgb2yuv(color.rgb);
  vec3 rgb = yuv2rgb(vec3(floor(yuv.x * u_num) / u_num, yuv.yz));
  color = vec4(rgb, 1.0);
  gl_FragColor = color;
}
\`;

const imageIn = node.imageIn('in');
const num = node.numberIn('amount', 3.0, { min: 2.0, max: 8.0, step: 0.1 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_num: num.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.centerAroundGray = `// center around gray on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform vec2 u_center;
varying vec2 v_uv;

float grayScale(in vec3 col)
{
    return dot(col, vec3(0.3, 0.59, 0.11));
}

void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_input_texture, uv).rgb;
  float dist = distance(uv, u_center);
  float vignette = smoothstep(u_radius, u_radius - 0.1, dist);
  vec3 gray = vec3(grayScale(col));
  col = mix(gray, col, clamp(vignette, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);

}
\`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
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
    u_radius: radiusIn.value,
    u_center: [centerXIn.value,centerYIn.value], });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.chromatic = `// Adds chromatic abberation to input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_factor;

vec2 CRTCurveUV( vec2 uv, float str )
{
    uv = uv * 2.0 - 1.0;
    vec2 offset = ( str * abs( uv.yx ) ) / vec2( 6.0, 4.0 );
    uv = uv + uv * offset * offset;
    uv = uv * 0.5 + 0.5;
    return uv;
}

void main() {
  vec2 uv = v_uv;
  uv = CRTCurveUV( uv, 0.5 );

  // chromatic abberation
  float caStrength    = u_factor;
  vec2 caOffset       = uv - 0.5;
  vec2 caUVG          = uv + caOffset * caStrength;
  vec2 caUVB          = uv + caOffset * caStrength * 2.0;

  vec3 color;
  color.x = texture2D(u_input_texture, uv).x;
  color.y = texture2D(u_input_texture, caUVG).y;
  color.z = texture2D(u_input_texture, caUVB).z;

  uv = CRTCurveUV( uv, 1.0 );
  if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ){
    color = vec3( 0.0, 0.0, 0.0 );
  }
  float vignette = uv.x * uv.y * ( 1.0 - uv.x ) * ( 1.0 - uv.y );
  vignette = clamp( pow( 16.0 * vignette, 0.3 ), 0.0, 1.0 );
  color *= vignette * 1.1;

  gl_FragColor = vec4( color, 1.0 );
}
\`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('factor', 0.05, { min: 0.0, max: 0.2, step: 0.001});
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

image.colorify = `// Repaint image in color of choice.

const fragmentShader = \`
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
\`;

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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
  u_color: [color[0] / 255, color[1] / 255, color[2] / 255, color[3]], });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.chromaKey = `// Make pixels of a certain color transparent, like green screen effect.
const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec3 u_keyColor;
uniform float u_threshold;
varying vec2 v_uv;
void main() {

  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);

  // calculate the color difference between the current pixel and the key color
  float difference = length(color.rgb - u_keyColor);

  // if the difference is less than the threshold, set the alpha to 0
  if (difference < u_threshold) {
    color.a = 0.0;
  }

  gl_FragColor = color;
}
\`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('key color', [0, 255, 0]);
const thresholdIn = node.numberIn('threshold', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_keyColor: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
    u_threshold: thresholdIn.value,
   });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.composite = `// Combine two images together.

const image1In = node.imageIn('image 1');
const image2In = node.imageIn('image 2');
const factorIn = node.numberIn('factor', 0.5, { min: 0, max: 1, step: 0.01 });
const operationIn = node.selectIn('operation', ['normal', 'darken', 'multiply', 'color burn', '---', 'lighten', 'screen', 'color dodge', '---', 'hardmix', 'difference', 'exclusion', 'subtract', 'divide'], 'normal');
const imageOut = node.imageOut('out');

function updateShader() {
  let blendFunction;
  if (operationIn.value === 'normal') {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'darken') {
    blendFunction = 'factor * vec3(min(c1.r, c2.r), min(c1.g, c2.g), min(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'multiply') {
    blendFunction = 'factor * (c1.rgb * c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'color burn') {
    blendFunction = 'factor * vec3(blendColorBurn(c1.r,c2.r),blendColorBurn(c1.g,c2.g),blendColorBurn(c1.b,c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'lighten') {
    blendFunction = 'factor * vec3(max(c1.r, c2.r), max(c1.g, c2.g), max(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'screen') {
    blendFunction = 'factor * vec3(blendScreen(c1.r, c2.r), blendScreen(c1.g, c2.g), blendScreen(c1.b, c2.b))';
  } else if (operationIn.value === 'color dodge') {
    blendFunction = 'factor * vec3(blendColorDodge(c1.r, c2.r), blendColorDodge(c1.g, c2.g), blendColorDodge(c1.b, c2.b))';
  } else if (operationIn.value === 'hardmix') {
    blendFunction = 'factor * floor(c1.rgb + c2.rgb)';
  } else if (operationIn.value === 'difference') {
    blendFunction = 'factor * abs(c1.rgb - c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'exclusion') {
    blendFunction = 'factor * c1.rgb + c2.rgb - 2.0 * c1.rgb *c2.rgb';
  } else if (operationIn.value === 'subtract') {
    blendFunction = 'factor * c1.rgb - c2.rgb';
  } else if (operationIn.value === 'divide') {
    blendFunction = 'factor * c1.rgb / c2.rgb';
  } else {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  }
  const fragmentShader = \`
  precision mediump float;
  uniform sampler2D u_image_1;
  uniform sampler2D u_image_2;
  uniform float u_factor;
  varying vec2 v_uv;
  float blendColorBurn(float c1, float c2) { return (c2==0.0)?c2:max((1.0-((1.0-c1)/c2)),0.0); }
  float blendScreen(float c1, float c2) { return 1.0-((1.0-c1)*(1.0-c2)); }
  float blendColorDodge(float c1, float c2) { return (c2==1.0)?c2:min(c1/(1.0-c2),1.0); }
  void main() {
    vec4 c1 = texture2D(u_image_1, v_uv);
    vec4 c2 = texture2D(u_image_2, v_uv);
    float factor = u_factor * c2.a;
    vec3 color = \${blendFunction};
    float alpha = min(c1.a + c2.a, 1.0);
    gl_FragColor = vec4(color, alpha);
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

image.conditional = `// Render an image conditionally.

const fragmentShader = \`
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
\`;

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
}

node.onRender = () => {
  const dt = (Date.now() - prevTime) / 1000; // convert ms to s
  prevTime = Date.now();

  if (!trueImageIn.value || !falseImageIn.value) return;

  direction = conditionIn.value ? -1 : 1;
  let bias = biasIn.value;
  let adjustedFadeTime = fadeTimeIn.value * ((direction === 1) ? bias : (1 - bias));
  adjustedFadeTime = Math.max(adjustedFadeTime, 0.0001); // Avoid division by zero
  factor = factor + direction * dt / adjustedFadeTime;
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

image.crop = `// Crop an input image.

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
  float crop_height = u_output_size.y;
  float crop_ratio = crop_width / crop_height;
  float delta_ratio = crop_ratio / image_ratio;
  if (image_ratio >  crop_ratio) {
    // The image is wider than the box
    float scale_factor = crop_width / u_resolution.x;
    float height_diff = (crop_height - u_resolution.y * scale_factor) / crop_height;
    float half_height_diff = height_diff / 2.0;
    if (v_uv.y < half_height_diff || v_uv.y > 1.0 - half_height_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2(v_uv.x + u_offset.x / u_resolution.x, (v_uv.y - half_height_diff) / delta_ratio + u_offset.y / u_resolution.y);
      vec4 texColor = texture2D(u_input_texture, uv);
      gl_FragColor = texColor;
    }
  } else {
    float scale_factor = crop_height / u_resolution.y;
    float width_diff = (crop_width - u_resolution.x * scale_factor) / crop_width;
    float half_width_diff = width_diff / 2.0;
    if (v_uv.x < half_width_diff || v_uv.x > 1.0 - half_width_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2((v_uv.x - half_width_diff) * delta_ratio + u_offset.x / u_resolution.x, v_uv.y + u_offset.y / u_resolution.y);
      vec4 texColor = texture2D(u_input_texture, uv);
      gl_FragColor = texColor;
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

node.onRender = () => {
  if (!imageIn.value) return;
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_offset: [offsetXIn.value, offsetYIn.value],
    u_output_size: [widthIn.value, heightIn.value],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.denoise = `// Noise reduction filter on input image.

const fragmentShader = \`
precision mediump float;
uniform vec2 u_texel_size;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 center = texture2D(u_input_texture, uv);
  vec4 sum = vec4(0.0);
  float totalWeight = 0.0;

  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 offset = vec2(x, y) * u_texel_size;
      vec4 sample = texture2D(u_input_texture, uv + offset);
      float weight = 1.0 / (1.0 + length(sample.rgb - center.rgb));
      sum += sample * weight;
      totalWeight += weight;
    }
  }

  gl_FragColor = sum / totalWeight;
}
\`;

const imageIn = node.imageIn('in');
const noiseIn = node.numberIn('denoise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
  u_texel_size: [noiseIn.value/imageIn.value.width, noiseIn.value/imageIn.value.height] });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.difference = `// Calculate the difference between this image and the previous one.
const fragmentShader = \`
precision mediump float;
uniform sampler2D u_current_texture;
uniform sampler2D u_previous_texture;
uniform float u_amplify;
varying vec2 v_uv;
void main() {
  vec3 currentColor = texture2D(u_current_texture, v_uv).rgb;
  vec3 previousColor = texture2D(u_previous_texture, v_uv).rgb;
  
  // Calculate absolute difference between current and previous color
  vec3 diff = abs(previousColor - currentColor) * u_amplify;
  
  gl_FragColor = vec4(diff, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const amplifyIn = node.numberIn('amplify', 1.0, { min: 0.0, max: 100.0, step: 0.01 });
const imageOut = node.imageOut('out');
let program, copyProgram, inputBuffer, outputBuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  copyProgram = figment.createShaderProgram();
  inputBuffer = new figment.Framebuffer();
  outputBuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;

  inputBuffer.setSize(imageIn.value.width, imageIn.value.height);
  outputBuffer.setSize(imageIn.value.width, imageIn.value.height);
  
  outputBuffer.bind();
  figment.clear();  
  figment.drawQuad(program, { 
    u_current_texture: imageIn.value.texture,
    u_previous_texture: inputBuffer.texture,
    u_amplify: amplifyIn.value,
  });
  outputBuffer.unbind();
  
  inputBuffer.bind();
  figment.clear();
  figment.drawQuad(copyProgram, { u_image: imageIn.value.texture });
  inputBuffer.unbind();
  
  imageOut.set(outputBuffer);
};
`;

image.distortion = `// Simple distortion on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_distortion;
uniform float u_time;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  float X = uv.x * 6. + u_time;
  float Y = uv.y * 6. + u_time;
  uv.x += cos(X + Y) * u_distortion * cos(Y);
  uv.y += sin(X + Y) * u_distortion * sin(Y);
  gl_FragColor = texture2D(u_input_texture, uv.st);
}
\`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const wave = node.numberIn('wave', 1.0, { min: 0.0, max: 10.0, step: 0.1 });
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
    u_time: wave.value, });
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

image.fetchImage = `// Fetch an image from a URL.
node.timeDependent = true;
const urlIn = node.stringIn('url', 'https://figmentapp.com/img/figment.png');
const refreshToggleIn = node.toggleIn('refresh', false);
const refreshTimeIn = node.numberIn('refresh time', 60.0, { min: 0, max: 9999, step: 0.1});
const imageOut = node.imageOut('out');

let _lastTime = 0, _texture, _framebuffer, _program;

node.onStart = () => {
  _program = figment.createShaderProgram();
  _framebuffer = new figment.Framebuffer();
};

node.onRender = async () => {
  if (!urlIn.value || urlIn.value.trim() === '') return;
  const timePassedSeconds = (Date.now() - _lastTime) / 1000;
  if (timePassedSeconds < refreshTimeIn.value || (!refreshToggleIn.value && _lastTime !== 0)) return;
  _lastTime = Date.now();
  try {
    const url = new URL(urlIn.value);
    url.searchParams.set('__cache', Date.now());
    const { texture, image } = await figment.createTextureFromUrlAsync(url.toString());
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

urlIn.onChange = () => {
  _lastTime = 0;
}
`;

image.freiChen = `// Freichen edges shader

const fragmentShader = \`
//Edge Detection Shader using Frei-Chen filter
//Based on http://rastergrid.com/blog/2011/01/frei-chen-edge-detector
precision mediump float;
uniform sampler2D u_input_texture;
//uniform vec2 u_aspect;
uniform vec2 u_resolution;

varying vec2 v_uv;

//vec2 texel = vec2( 1.0 / aspect.x, 1.0 / aspect.y );
vec2 texel = vec2( 1.0 / u_resolution.x,  1.0 / u_resolution.y);
mat3 G[9];

// hard coded matrix values!!!! as suggested in https://github.com/neilmendoza/ofxPostProcessing/blob/master/src/EdgePass.cpp#L45

const mat3 g0 = mat3( 0.3535533845424652, 0, -0.3535533845424652, 0.5, 0, -0.5, 0.3535533845424652, 0, -0.3535533845424652 );
const mat3 g1 = mat3( 0.3535533845424652, 0.5, 0.3535533845424652, 0, 0, 0, -0.3535533845424652, -0.5, -0.3535533845424652 );
const mat3 g2 = mat3( 0, 0.3535533845424652, -0.5, -0.3535533845424652, 0, 0.3535533845424652, 0.5, -0.3535533845424652, 0 );
const mat3 g3 = mat3( 0.5, -0.3535533845424652, 0, -0.3535533845424652, 0, 0.3535533845424652, 0, 0.3535533845424652, -0.5 );
const mat3 g4 = mat3( 0, -0.5, 0, 0.5, 0, 0.5, 0, -0.5, 0 );
const mat3 g5 = mat3( -0.5, 0, 0.5, 0, 0, 0, 0.5, 0, -0.5 );
const mat3 g6 = mat3( 0.1666666716337204, -0.3333333432674408, 0.1666666716337204, -0.3333333432674408, 0.6666666865348816, -0.3333333432674408, 0.1666666716337204, -0.3333333432674408, 0.1666666716337204 );
const mat3 g7 = mat3( -0.3333333432674408, 0.1666666716337204, -0.3333333432674408, 0.1666666716337204, 0.6666666865348816, 0.1666666716337204, -0.3333333432674408, 0.1666666716337204, -0.3333333432674408 );
const mat3 g8 = mat3( 0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.3333333432674408, 0.3333333432674408 );

void main() {
  vec2 uv = v_uv;
  //vec4 base = texture2D( u_input_texture, uv );

  G[0] = g0,
  G[1] = g1,
  G[2] = g2,
  G[3] = g3,
  G[4] = g4,
  G[5] = g5,
  G[6] = g6,
  G[7] = g7,
  G[8] = g8;

  mat3 I;
  float cnv[9];
  vec3 sample;

/* fetch the 3x3 neighbourhood and use the RGB vector's length as intensity value */
  for (float i=0.0; i<3.0; i++) {
    for (float j=0.0; j<3.0; j++) {
      sample = texture2D(u_input_texture, uv + texel * vec2(i-1.0,j-1.0) ).rgb;
      I[int(i)][int(j)] = length(sample);
    }
  }

/* calculate the convolution values for all the masks */
  for (int i=0; i<9; i++) {
    float dp3 = dot(G[i][0], I[0]) + dot(G[i][1], I[1]) + dot(G[i][2], I[2]);
    cnv[i] = dp3 * dp3;
  }

  float M = (cnv[0] + cnv[1]) + (cnv[2] + cnv[3]);
  float S = (cnv[4] + cnv[5]) + (cnv[6] + cnv[7]) + (cnv[8] + M);

  gl_FragColor = vec4(vec3(sqrt(M/S)), 1.0);
}
\`;

const imageIn = node.imageIn('in');
const resolutionIn = node.numberIn('resolution', 512, { min: 4, max: 2048, step: 1 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_resolution: [resolutionIn.value, resolutionIn.value],});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.gaussianBlur = `// Change the colors of the input image.

//https://www.rastergrid.com/blog/2010/09/efficient-gaussian-blur-with-linear-sampling/
const fragmentShader = \`
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
\`;

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
    weight: [0.2270270270, 0.3162162162, 0.0702702703]
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.glitch = `// Glitches on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_randomSeed;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv;

  // Add random noise to the UV coordinates
  float noise = fract(sin(dot(uv + u_randomSeed, vec2(12.9898, 78.233)) * 43758.5453));
  uv += (noise - 0.5) * 0.2;

  // Sample the texture at the modified UV coordinates
  vec4 color = texture2D(u_input_texture, uv);

  // Apply a color shift effect based on the x and y coordinates
  float shiftX = sin(uv.x * 0.01 + u_randomSeed) * 0.1;
  float shiftY = sin(uv.y * 0.01 + u_randomSeed) * 0.1;
  color.r = texture2D(u_input_texture, vec2(uv.x + shiftX, uv.y + shiftY)).r;
  color.g = texture2D(u_input_texture, vec2(uv.x - shiftX, uv.y - shiftY)).g;
  color.b = texture2D(u_input_texture, vec2(uv.x + shiftY, uv.y - shiftX)).b;

  // Output the color
  gl_FragColor = color;
}
\`;

const imageIn = node.imageIn('in');
const seedIn = node.numberIn('seed', 50.0, { min: 0.0, max: 1000.0, step: 1.0 });
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
  u_randomSeed: seedIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.glowEdges = `// Computes glowing edges on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
uniform float u_stroke;
varying vec2 v_uv;

void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord)
{
  float w = u_stroke / u_resolution.x;
  float h = u_stroke / u_resolution.y;

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
  vec2 p = uv;
  vec4 n[9];
  make_kernel(n, u_input_texture, uv.st);

  vec4 sobel_edge_h = n[2] + (2.0*n[5]) + n[8] - (n[0] + (2.0*n[3]) + n[6]);
  vec4 sobel_edge_v = n[0] + (2.0*n[1]) + n[2] - (n[6] + (2.0*n[7]) + n[8]);
  vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));

  float r = (sobel_edge_h.r*sobel_edge_h.r + sobel_edge_v.r*sobel_edge_v.r)*u_color.r;
  float g = (sobel_edge_h.g*sobel_edge_h.g + sobel_edge_v.g*sobel_edge_v.g)*u_color.g;
  float b = (sobel_edge_h.b*sobel_edge_h.b + sobel_edge_v.b*sobel_edge_v.b)*u_color.b;

  vec4 col = texture2D(u_input_texture, uv);
  col += vec4(r, g, b,1.0);
  gl_FragColor = col;
}
\`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('edge color', [0, 255, 0, 1.0]);
const strokeIn = node.numberIn('stroke width', 1.0, { min: 0.0, max: 5.0, step: .1 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255, colorIn.value[3]],
    u_stroke: strokeIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.grayColorCLustering = `// Rgb color clustering  on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);

    // Determine the closest color cluster
    vec3 cluster1 = vec3(1.0, 1.0, 1.0); // White cluster
    vec3 cluster2 = vec3(0.8, 0.8, 0.8); // Gray 80% white cluster
    vec3 cluster3 = vec3(0.6, 0.6, 0.6); // Gray 60% white cluster
    vec3 cluster4 = vec3(0.4, 0.4, 0.4); // Gray 40% white cluster
    vec3 cluster5 = vec3(0.2, 0.2, 0.2); // Gray 20% white cluster
    vec3 cluster6 = vec3(0.0, 0.0, 0.0); // Black cluster

    float dist1 = distance(color.rgb, cluster1);
    float dist2 = distance(color.rgb, cluster2);
    float dist3 = distance(color.rgb, cluster3);
    float dist4 = distance(color.rgb, cluster4);
    float dist5 = distance(color.rgb, cluster5);
    float dist6 = distance(color.rgb, cluster6);

    vec3 closestCluster;
    if (dist1 < dist2 && dist1 < dist3 && dist1 < dist4 && dist1 < dist5 && dist1 < dist6) {
      closestCluster = cluster1;
    } else if (dist1 > dist2 && dist2 < dist3 && dist2 < dist4 && dist2 < dist5 && dist2 < dist6) {
      closestCluster = cluster2;
    } else if (dist1 > dist3 && dist2 > dist3 && dist3 < dist4 && dist3 < dist5 && dist3 < dist6) {
      closestCluster = cluster3;
    } else if (dist1 > dist4 && dist2 > dist4 && dist3 > dist4 && dist4 < dist5 && dist4 < dist6) {
      closestCluster = cluster4;
    } else if (dist1 > dist5 && dist2 > dist5 && dist3 > dist5 && dist5 < dist4 && dist5 < dist6) {
      closestCluster = cluster5;
    } else{
      closestCluster = cluster6;
    }

    // Set the output color to the closest cluster color
    gl_FragColor = vec4(closestCluster, color.a);

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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,});
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

image.heatmap = `// heatmap filter based on monocular depth estimation on image.
//experimental//

const fragmentShader = \`
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
\`;

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
    u_input_texture: imageIn.value.texture, u_focal_length: focalIn.value,
    u_disparity_scale: disparityIn.value,u_min_depth: depthMinIn.value,u_max_depth: depthMaxIn.value});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.inms = `// INMS (Intensity-based Non-Maximum Suppression) edge detection on input image.

const fragmentShader = \`
precision mediump float;
uniform vec2 u_texel_size;
uniform float u_increase;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;

  // Sample the texture at the current UV coordinate and its neighbors
  float center = texture2D(u_input_texture, v_uv).r;
  float top = texture2D(u_input_texture, v_uv + vec2(0.0, u_texel_size.y)).r;
  float bottom = texture2D(u_input_texture, v_uv - vec2(0.0, u_texel_size.y)).r;
  float left = texture2D(u_input_texture, v_uv - vec2(u_texel_size.x, 0.0)).r;
  float right = texture2D(u_input_texture, v_uv + vec2(u_texel_size.x, 0.0)).r;

  // Compute the gradient and its magnitude
  float gx = (right - left) / (2.0 * u_texel_size.x);
  float gy = (top - bottom) / (2.0 * u_texel_size.y);
  float gradientMagnitude = sqrt(gx * gx + gy * gy);

  // Compute the local gradient direction
  float gradientDirection = atan(gy, gx);

  // Round the direction to one of four cardinal directions
  float directionSign = sign(gradientDirection);
  float absDirection = abs(gradientDirection);
  float mod = mod(absDirection, 0.5 * 3.14159265359);
  float roundedDirection = directionSign * (absDirection - mod + 0.25 * 3.14159265359);

  // Compute the magnitudes of the gradients in the two orthogonal directions
  float magnitude1 = abs(cos(roundedDirection)) * gradientMagnitude * u_increase;
  float magnitude2 = abs(sin(roundedDirection)) * gradientMagnitude * u_increase;

  // Compute the non-maximum suppressed edge intensity
  float suppressedIntensity = center - 0.5 * (magnitude1 + magnitude2);

  // Output the edge intensity as grayscale
  //gl_FragColor = vec4(vec3(suppressedIntensity), 1.0);
  gl_FragColor = vec4(vec3(step(u_threshold, suppressedIntensity)), 1.0);
}
\`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 0.02, { min: 0.0, max: 0.5, step: 0.001 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
  u_texel_size: [blurIn.value/imageIn.value.width, blurIn.value/imageIn.value.height],
u_increase: increaseIn.value,
u_threshold: thresholdIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.instagram = `//  Instagram filters on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_selector;
varying vec2 v_uv;

void main() {

  vec2 uv = v_uv;
    vec4 texel = texture2D(u_input_texture, uv);
  if(u_selector==0.0){
    // Sample the input texture
   // vec2 uv = v_uv;
    //vec4 texel = texture2D(u_input_texture, uv);

    // Apply color adjustment
    texel.rgb = mix(texel.rgb, vec3(1.0, 0.9, 0.75), 0.2);

    // Apply vignette effect
    float dist = distance(uv, vec2(0.5, 0.5));
    float vignette = smoothstep(1.0, .98, dist*1.5);
    texel.rgb *= vignette;

    // Output the final color
    gl_FragColor = texel;
  }
  if(u_selector==1.0){
    // Apply color adjustment
    texel.rgb = mix(texel.rgb, vec3(0.97, 0.78, 0.58), 0.2);
    texel.rgb = mix(texel.rgb, vec3(0.15, 0.15, 0.85), 0.2);

    // Apply contrast boost
    texel.rgb = mix(vec3(0.5), texel.rgb, 0.9);

    // Output the final color
    gl_FragColor = texel;
  }
  if(u_selector==2.0){
    // Apply brightness and contrast adjustments
    texel.rgb = mix(vec3(0.5), texel.rgb, 0.9);
    texel.rgb = pow(texel.rgb, vec3(0.8, 0.9, 1.0));

    // Apply color filtering
    vec3 filter_color = vec3(0.9, 0.5, 0.2);
    texel.rgb = mix(filter_color, texel.rgb, 0.7);

    // Apply vignette
    float vignette = length(uv - vec2(0.5)) * 1.5;
    texel.rgb *= smoothstep(1.0, 0.95, vignette);

    // Output the final color
    gl_FragColor = texel;
  }
  if(u_selector==3.0){
    // Apply brightness and contrast adjustments
    texel.rgb = mix(vec3(0.5), texel.rgb, 0.95);
    texel.rgb = pow(texel.rgb, vec3(1.2, 1.1, 1.0));

    // Apply color filtering
    vec3 filter_color = vec3(0.9, 0.8, 0.7);
    texel.rgb = mix(filter_color, texel.rgb, 0.9);

    // Apply vignette
    float vignette = length(uv - vec2(0.5)) * 1.5;
    texel.rgb *= smoothstep(1.0, 0.95, vignette);

    // Output the final color
    gl_FragColor = texel;
  }
  if(u_selector==4.0){
    // Apply brightness and contrast adjustments
    texel.rgb = mix(vec3(0.5), texel.rgb, 0.95);
    texel.rgb = pow(texel.rgb, vec3(1.2, 1.1, 1.0));

    // Apply color filtering
    vec3 filter_color = vec3(0.9, 0.6, 0.4);
    texel.rgb = mix(filter_color, texel.rgb, 0.7);

    // Apply color toning
    vec3 toning_color1 = vec3(0.99, 0.95, 0.85);
    vec3 toning_color2 = vec3(0.3, 0.1, 0.2);
    vec3 toning = mix(toning_color1, toning_color2, 0.5);
    texel.rgb = mix(texel.rgb, toning, 0.2);

    // Apply vignette
    float vignette = length(uv - vec2(0.5)) * 1.5;
    texel.rgb *= smoothstep(1.0, 0.98, vignette);

    // Output the final color
    gl_FragColor = texel;
  }
  if(u_selector==5.0){
    // Apply brightness and contrast adjustments
    texel.rgb = mix(vec3(0.75), texel.rgb, 0.85);
    texel.rgb = pow(texel.rgb, vec3(1.2, 1.1, 1.0));

    // Apply color filtering
    vec3 filter_color = vec3(0.95, 0.75, 0.55);
    texel.rgb = mix(filter_color, texel.rgb, 0.9);

    // Apply color toning
    vec3 toning_color1 = vec3(1.0, 0.8, 0.6);
    vec3 toning_color2 = vec3(0.4, 0.3, 0.1);
    vec3 toning = mix(toning_color1, toning_color2, 0.95);
    texel.rgb = mix(texel.rgb, toning, 0.3);

    // Apply vignette
    float vignette = length(uv - vec2(0.5)) * 1.5;
    texel.rgb *= smoothstep(1.0, 0.9, vignette);

    // Output the final color
    gl_FragColor = texel;

  }else{
    gl_FragColor = texel;
  }
}
\`;

const imageIn = node.imageIn('in');
const directionIn = node.selectIn('Filter', ['Amaro', 'Clarendon', 'Juno', 'Lark', 'Nashville', 'Valencia','None']);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  let u_selector;
  if (directionIn.value === 'Valencia') {
    u_selector = 0.0;
  }
  if (directionIn.value === 'Clarendon') {
    u_selector = 1.0;
  }
  if (directionIn.value === 'Amaro') {
    u_selector = 2.0;
  }
  if (directionIn.value === 'Lark') {
    u_selector = 3.0;
  }
  if (directionIn.value === 'Nashville') {
    u_selector = 4.0;
  }
  if (directionIn.value === 'Juno') {
    u_selector = 5.0;
  }
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_selector});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.invert = `// Invert the colors of input image.

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

image.kaleidoscope = `// Radial reflection around center point of image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_sides;
uniform float u_angle;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;

  vec2 p = v_uv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x) + u_angle;
  float tau = 2. * 3.1416 ;
  a = mod(a, tau/u_sides);
  a = abs(a - tau/u_sides/2.) ;
  p = r * vec2(cos(a), sin(a));
  vec4 color = texture2D(u_input_texture, p + 0.5);
  gl_FragColor = color;
}
\`;

const imageIn = node.imageIn('in');
const angleIn = node.numberIn('angle', 0.0, { min: 0.0, max: 6.3, step: 0.01 });
const sidesIn = node.numberIn('sides', 6.0, { min: 0.0, max: 35.0, step: 1.0 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
u_sides: sidesIn.value,
u_angle: angleIn.value, });
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

const LOAD_STATE_NONE = 0;
const LOAD_STATE_LOADING = 1;
const LOAD_STATE_LOADED = 2;

let _loadState, _files, _fileIndex, _texture, _image, _framebuffer, _program, _lastTime;

node.onStart = () => {
  _program = figment.createShaderProgram();
  _framebuffer = new figment.Framebuffer();
  _fileIndex = 0;
  _lastTime = Date.now();
  _loadState = LOAD_STATE_NONE;
}

node.onRender = async () => {
  if (_loadState === LOAD_STATE_NONE) {
    loadDirectory();
  } else if (_loadState === LOAD_STATE_LOADING) {
    return;
  }

  const runtimeMode = window.desktop.getRuntimeMode();
  if (runtimeMode === 'export') {
    _fileIndex = (window.desktop.getCurrentFrame() - 1) % _files.length;
    await loadImage();
  } else {
    const deltaTime = Date.now() - _lastTime;
    if (deltaTime > 1000 / frameRateIn.value) {
      _lastTime = Date.now();
      if (animateIn.value) {
        await nextImage();
      }
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

function changeDirectory() {
  _loadState = LOAD_STATE_NONE;
}

async function loadDirectory() {
  _loadState = LOAD_STATE_LOADING;
  if (!folderIn.value || folderIn.value.trim().length === 0) {
    _files = [];
    _loadState = LOAD_STATE_LOADED;
    return;
  }
  const baseDir = figment.filePathForAsset(folderIn.value);
  try {
    _files = await window.desktop.globFiles(baseDir, filterIn.value);
  } catch (err) {
    onLoadError();
  }
  _fileIndex = -1;
  _loadState = LOAD_STATE_LOADED;
  nextImage();
}

function onLoadError() {
  _files = [];
  _image = null;
  _texture = null;
  const texture = figment.createErrorTexture();
  _framebuffer.setSize(100, 56);
  _framebuffer.bind();
  figment.drawQuad(_program, { u_image: texture });
  _framebuffer.unbind();
  imageOut.set(_framebuffer);
  _loadState = LOAD_STATE_LOADED;
}

function onLoadImage(err, texture, image) {
  if (err) {
    throw new Error(\`Image load error: \${err\}\`);
  }
  _texture = texture;
  _image = image;
}

async function nextImage() {
  if (_files.length === 0) return;
  _fileIndex++;
  if (_fileIndex >= _files.length) {
    _fileIndex = 0;
  }
  await loadImage();
}

async function loadImage() {
  if (_texture) {
    window.gl.deleteTexture(_texture);
    _texture = null;
  }

  const file = _files[_fileIndex];
  const imageUrl = figment.urlForAsset(file);
  const {texture, image} = await figment.createTextureFromUrlAsync(imageUrl.toString());
  onLoadImage(null, texture, image);
}

folderIn.onChange = changeDirectory;
filterIn.onChange = changeDirectory;
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

image.logEdges = `// Laplacian of Gaussian (LoG) edge detection on input image.

const fragmentShader = \`
precision mediump float;
uniform vec2 u_texel_size;
uniform float u_increase;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;

  // Create a 5x5 kernel for LoG
  float kernel[25];
  kernel[0] = 0.003765; kernel[1] = 0.015019; kernel[2] = 0.023792; kernel[3] = 0.015019; kernel[4] = 0.003765;
  kernel[5] = 0.015019; kernel[6] = 0.059912; kernel[7] = 0.094907; kernel[8] = 0.059912; kernel[9] = 0.015019;
  kernel[10] = 0.023792; kernel[11] = 0.094907; kernel[12] = 0.150342; kernel[13] = 0.094907; kernel[14] = 0.023792;
  kernel[15] = 0.015019; kernel[16] = 0.059912; kernel[17] = 0.094907; kernel[18] = 0.059912; kernel[19] = 0.015019;
  kernel[20] = 0.003765; kernel[21] = 0.015019; kernel[22] = 0.023792; kernel[23] = 0.015019; kernel[24] = 0.003765;

  // Normalize the kernel
  float sum = 0.0;
  for (int i = 0; i < 25; i++) {
      sum += kernel[i];
  }
  for (int i = 0; i < 25; i++) {
      kernel[i] /= sum;
  }

  // Compute the LoG filter by convolving the image with the kernel
  float edge = 0.0;
  float intensity=0.0;
  for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
          vec2 offset = vec2(float(i), float(j)) * u_texel_size;
          intensity = texture2D(u_input_texture, uv + offset).r;
          edge += intensity * kernel[(i+2)*5 + (j+2)];
      }
  }
  edge *= u_increase;
  // Output the edge as a grayscale value in the red, green, and blue channels
  //gl_FragColor = vec4(vec3(edge), 1.0);
  //gl_FragColor = vec4(vec3(suppressedIntensity), 1.0);
  gl_FragColor = vec4(vec3(step(u_threshold, edge),edge,edge), 1.0);

}
\`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
  u_texel_size: [blurIn.value/imageIn.value.width, blurIn.value/imageIn.value.height],
u_increase: increaseIn.value,
u_threshold: thresholdIn.value,});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
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

image.maskCircle = `// Draw a circular mask of an image or color.

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

image.maskImage = `// Mask the input image with another image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_source_texture;
uniform sampler2D u_mask_texture;
uniform int u_mask_method;
varying vec2 v_uv;

void main() {
  vec4 input_color = texture2D(u_source_texture, v_uv);
  vec4 mask_color = texture2D(u_mask_texture, v_uv);
  if (u_mask_method == 1) {
    // Mask method 1: use the color component of the image.
    gl_FragColor = vec4(input_color.r, input_color.g, input_color.b, input_color.a * mask_color.r);
  } else if (u_mask_method == 2) {
    // Mask method 2: use the alpha component of the mask image.
    gl_FragColor = vec4(input_color.r, input_color.g, input_color.b, input_color.a * mask_color.a);
  }
}
\`;

const sourceIn = node.imageIn('source');
const maskIn = node.imageIn('mask');
const maskMethodIn = node.selectIn('maskMethod', ['white', 'alpha']);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!sourceIn.value) return;
  if (!maskIn.value) {
    imageOut.set(sourceIn.value);
    return;
  }
  framebuffer.setSize(sourceIn.value.width, sourceIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_source_texture: sourceIn.value.texture,
    u_mask_texture: maskIn.value.texture,
    u_mask_method: maskMethodIn.value === 'white' ? 1 : 2,
    u_resolution: [sourceIn.value.width, sourceIn.value.height],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
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

image.modulateColor = `// Change the colors of the input image.

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
  col.r = clamp(col.r + u_red, 0.0, 1.0);
  col.g = clamp(col.g + u_green, 0.0, 1.0);
  col.b = clamp(col.b + u_blue, 0.0, 1.0);
  gl_FragColor = col;
}
\`;

const imageIn = node.imageIn('in');
const redIn = node.numberIn('red', 0, { min: -1, max: 1, step: 0.001 });
const greenIn = node.numberIn('green', 0, { min: -1, max: 1, step: 0.001 });
const blueIn = node.numberIn('blue', 0, { min: -1, max: 1, step: 0.001 });
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

image.noise = `// Adds noise on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_seed;
uniform float u_noise_intensity;
varying vec2 v_uv;

float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453 + u_seed);
}

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);
    //same with color not b/w
    //vec3 noise = vec3(rand(uv), rand(uv + vec2(5.2, 1.3)), rand(uv + vec2(-2.4, 3.7))) * u_noise_intensity;
    //gl_FragColor = vec4(color.rgb + noise, color.a);
    float noise = rand(uv) * u_noise_intensity;
    vec3 noise_color = vec3(noise);
    vec3 blended_color = mix(color.rgb, noise_color, 0.5);
    gl_FragColor = vec4(blended_color, color.a);
}
\`;

const imageIn = node.imageIn('in');
const noiseIn = node.numberIn('noise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const seedIn = node.numberIn('seed', 2.0, { min: 0.0, max: 100.0, step: 0.0001 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_noise_intensity: noiseIn.value, u_seed: seedIn.value });
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

image.pixelSize = `// Pixelate input image based on the size of the pixel.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform float u_pixel_size;
varying vec2 v_uv;

void main() {
  vec2 p = v_uv * u_resolution;
  vec2 pixel_size = vec2(u_pixel_size, u_pixel_size);
  vec2 pixel_pos = floor(p / pixel_size) * pixel_size;
  vec2 sample_pos = pixel_pos / u_resolution;
  vec3 col = texture2D(u_input_texture, sample_pos).rgb;
  gl_FragColor = vec4(col, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const pixelSize = node.numberIn('pixel size', 50, { min: 1.0, max: 100.0, step: 1.0 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_pixel_size: pixelSize.value,
    u_resolution:[imageIn.value.width, imageIn.value.height] });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.radialDistortion = `// Radial distortion on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_distortion;
uniform float u_time;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv - 0.5; // translate coordinates to center
  float radius = length(uv); // get polar radius
  float angle = atan(uv.y, uv.x); // get polar angle
  radius += cos(angle * 4.0 + u_time) * u_distortion; // apply radial distortion
  uv = radius * vec2(cos(angle), sin(angle)); // convert back to cartesian coordinates
  uv += 0.5; // translate coordinates back to corner
  gl_FragColor = texture2D(u_input_texture, uv.st);
}
\`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const rotate = node.numberIn('rotate', 1.0, { min: 0.0, max: 25.0, step: 0.1 });
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
    u_time: rotate.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.reactionDiffusion = `// Reaction diffusion on input image.
const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform sampler2D u_prev_texture;
uniform vec2 u_resolution;
varying vec2 v_uv;
uniform float u_influence;
uniform float u_delta_time;
uniform float u_feed_rate;
uniform float u_kill_rate;
uniform float u_diffusion_rate_a;
uniform float u_diffusion_rate_b;

void main() {
  vec2 uv = v_uv;
  vec2 texel_size = 1.0 / u_resolution;

  vec4 current = texture2D(u_input_texture, uv);
  vec4 laplacian = texture2D(u_input_texture, uv + vec2(-1.0, 0.0) * texel_size) +
                   texture2D(u_input_texture, uv + vec2(1.0, 0.0) * texel_size) +
                   texture2D(u_input_texture, uv + vec2(0.0, -1.0) * texel_size) +
                   texture2D(u_input_texture, uv + vec2(0.0, 1.0) * texel_size) -
                   4.0 * current;

  vec4 pixel = current + texture2D(u_prev_texture, uv) * u_influence;
  float a = pixel.r;
  float b = pixel.g;

  float reaction = a * b * b;
  float da = u_diffusion_rate_a * laplacian.r - reaction + u_feed_rate * (1.0 - a);
  float db = u_diffusion_rate_b * laplacian.g + reaction - (u_kill_rate + u_feed_rate) * b;

  vec2 result = current.rg + vec2(da, db) * u_delta_time;
  gl_FragColor = vec4(result.r, result.g, 0.0, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const influenceIn = node.numberIn('influence', 0.15, { min: 0.0, max: 1.0, step: 0.01 });
const deltaTimeIn = node.numberIn('delta time', 1.0);
const feedRateIn = node.numberIn('feed rate', 0.037, { min: 0.0, max: 0.1, step: 0.0001 });
const killRateIn = node.numberIn('kill rate', 0.06, { min: 0.0, max: 0.1, step: 0.0001 });
const diffusionRateAIn = node.numberIn('diffusion A', 0.2097, { min: 0.0, max: 1.0, step: 0.0001 });
const diffusionRateBIn = node.numberIn('diffusion B', 0.105, { min: 0.0, max: 1.0, step: 0.0001 });
const iterationsIn = node.numberIn('iterations', 10, { min: 1, max: 50, step: 1 });
const resetIn = node.triggerButtonIn('reset');
const imageOut = node.imageOut('out');

let program, copyProgram, framebuffer, pingPongFramebuffers;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
  pingPongFramebuffers = [new figment.Framebuffer(), new figment.Framebuffer()];
};

node.onRender = () => {
  if (!imageIn.value) return;

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  framebuffer.setSize(width, height);
  pingPongFramebuffers[0].setSize(width, height);
  pingPongFramebuffers[1].setSize(width, height);

  // Perform reaction-diffusion iterations
  for (let i = 0; i < iterationsIn.value; i++) {
    pingPongFramebuffers[1].bind();
    figment.clear();
    figment.drawQuad(program, {
      u_input_texture: pingPongFramebuffers[0].texture,
      u_prev_texture: imageIn.value.texture,
      u_resolution: [width, height],
      u_influence: influenceIn.value,
      u_delta_time: deltaTimeIn.value,
      u_feed_rate: feedRateIn.value,
      u_kill_rate: killRateIn.value,
      u_diffusion_rate_a: diffusionRateAIn.value,
      u_diffusion_rate_b: diffusionRateBIn.value,
    });
    pingPongFramebuffers[1].unbind();

    // Swap ping-pong framebuffers
    const temp = pingPongFramebuffers[0];
    pingPongFramebuffers[0] = pingPongFramebuffers[1];
    pingPongFramebuffers[1] = temp;
  }

  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: pingPongFramebuffers[0].texture });
  framebuffer.unbind();

  imageOut.set(framebuffer);
};


function resetSimulation() {
    pingPongFramebuffers[0].bind();
    figment.clear();
    pingPongFramebuffers[0].unbind();
}
node.onReset = resetSimulation;
resetIn.onTrigger = resetSimulation;
`;

image.reduceColor = `// Reduce the amount of colors of input image.

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

image.rgbColorCLustering = `// Rgb color clustering  on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);

    // Determine the closest color cluster
    vec3 cluster1 = vec3(1.0, 0.0, 0.0); // Red cluster
    vec3 cluster2 = vec3(0.0, 1.0, 0.0); // Green cluster
    vec3 cluster3 = vec3(0.0, 0.0, 1.0); // Blue cluster

    float dist1 = distance(color.rgb, cluster1);
    float dist2 = distance(color.rgb, cluster2);
    float dist3 = distance(color.rgb, cluster3);

    vec3 closestCluster;
    if (dist1 < dist2 && dist1 < dist3) {
      closestCluster = cluster1;
    } else if (dist2 < dist3) {
      closestCluster = cluster2;
    } else {
      closestCluster = cluster3;
    }

    // Set the output color to the closest cluster color
    gl_FragColor = vec4(closestCluster, color.a);

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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.saveImage = `// Save the image to disk.

const imageIn = node.imageIn('in');
const enableIn = node.selectIn('Enable', ['On Export', 'Always', 'Never'], 'On Export');
const folderIn = node.directoryIn('folder', '');
const templateIn = node.stringIn('template', 'image-#####.png');
const imageQualityIn = node.numberIn('quality', 0.9, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

node.onRender = async () => {
  if (!imageIn.value) return;
  imageOut.set(imageIn.value);

  if (enableIn.value === 'Never') return;
  const runtimeMode = window.desktop.getRuntimeMode();
  if (enableIn.value === 'On Export' && runtimeMode !== 'export') return;

  const folder = folderIn.value;
  if (!folder) return;
  const baseDir = figment.filePathForAsset(folder);
  const template = templateIn.value;
  const fileExt = template.split('.').pop().toLowerCase();
  let imageType;
  if (fileExt === 'png') {
    imageType = 'image/png';
  } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
    imageType = 'image/jpeg';
  } else {
    console.error('Unsupported file extension: ' + fileExt);
    return;
  }
  const imageQuality = imageQualityIn.value;
  await figment.ensureDirectory(baseDir);
  // Read out the pixels of the framebuffer.
  const framebuffer = imageIn.value;
  const imageData = new ImageData(framebuffer.width, framebuffer.height);
  framebuffer.bind();
  window.gl.readPixels(0, 0, framebuffer.width, framebuffer.height, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
  framebuffer.unbind();
  // Put the image data into an offscreen canvas.
  const canvas = new OffscreenCanvas(framebuffer.width, framebuffer.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  // Convert the canvas to a PNG blob, then to a buffer.
  const blob = await canvas.convertToBlob({ type: imageType, quality: imageQuality });
  const pngBuffer = await blob.arrayBuffer();
  // Write the buffer to the given file path.
  const currentFrame = window.desktop.getCurrentFrame();
  const digits = template.split('#').length - 1;
  const filePath = baseDir + '/' + template.replace(/#{1,10}/, currentFrame.toString().padStart(digits, '0'));
  await window.desktop.saveBufferToFile(pngBuffer, filePath);
};
`;

image.screendistortion = `// Simple distortion on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_distortion;
uniform float u_lines;
uniform vec2 u_resolution;
varying vec2 v_uv;

float sawtooth( float t ) {
	return abs(mod(abs(t), 2.0)-1.0);
}

void main() {
  vec2 uv = v_uv;
  float distpow = (1.2-u_distortion) * 10.0;

const vec2 ctr = vec2(0.5,0.5);
vec2 ctrvec = ctr - uv;
float ctrdist = length( ctrvec );
ctrvec /= ctrdist;
uv += ctrvec * max(0.0, pow(ctrdist, distpow)-0.0025);

vec2 div = 40.0 * vec2(1.0, u_resolution.y / u_resolution.x );
float lines = 0.0;
lines += smoothstep( 0.2, 0.0, sawtooth( uv.x*2.0*div.x ) );
lines += smoothstep( 0.2, 0.0, sawtooth( uv.y*2.0*div.y ) );
lines = clamp( lines, 0.0, 1.0 );
vec3 outcol = vec3(0.0);
outcol += texture2D(u_input_texture, uv ).rgb;
if(u_lines==1.0){
  outcol *= vec3(1.0-lines); //black lines
}

vec2 valid = step( vec2(0.0), uv ) * step( uv, vec2(1.0) );
outcol *= valid.x*valid.y;
gl_FragColor = vec4(outcol,1.0);
}
\`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: 0.0, max: 1.5, step: 0.01 });
const linesIn = node.selectIn('Lines', ['On', 'Off']);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  let u_lines;
  if (linesIn.value === 'On') {
    u_lines = 1.0;
  } else {
    u_lines = 0.0;
  }
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_distortion: dist.value,
  u_resolution: [imageIn.value.width, imageIn.value.height],
u_lines });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.sepia = `// Sepia filter on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_factor;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  vec3 sepia = vec3(1.2, 1.0, 0.8)*u_factor;
  vec3 gray = vec3(dot(color.rgb, vec3(0.299, 0.587, 0.114)));
  vec3 final_color = mix(gray, gray * sepia, 0.5);
  gl_FragColor = vec4(final_color, color.a);
}
\`;

const imageIn = node.imageIn('in');
const sepiaIn = node.numberIn('sepia factor', 1.0, { min: 0.0, max: 2.0, step: 0.01 });
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
    u_factor: sepiaIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.sharpen = `// Sharpen an input image.

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

image.solarize = `// Solarize filter on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);
    vec3 solarized_color = clamp(color.rgb, 0.0, 1.0);
    solarized_color = mix(solarized_color, 1.0 - solarized_color, step(u_threshold, solarized_color));
    gl_FragColor = vec4(solarized_color, color.a);
}
\`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.0, { min: 0.0, max: 1.5, step: 0.01 });
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
    u_threshold: thresholdIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.squares = `// Return input image as squares.

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

image.technicolor = `// Simulates the look of the two-strip technicolor process popular in early 20th century films.

const fragmentShader = \`
// http://www.widescreenmuseum.com/oldcolor/technicolor1.htm
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 tex = texture2D( u_input_texture, vec2( uv.x, uv.y ) );
  vec4 newTex = vec4(tex.r, (tex.g + tex.b) * .5, (tex.g + tex.b) * .5, 1.0);
  gl_FragColor = newTex;
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, });
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

image.transform = `// Translate/rotate/scale the image.

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

image.vignette = `// Vignette  on image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform vec2 u_center;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    float dist = distance(uv, u_center);
    float vignette = smoothstep(u_radius, u_radius - 0.1, dist);
    vec4 color = texture2D(u_input_texture, uv);
    color.rgb *= vignette;
    gl_FragColor = color;
}
\`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
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
    u_radius: radiusIn.value,
    u_center: [centerXIn.value,centerYIn.value],});
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
`;

image.webcamImage = `// Return a webcam or virtual cam stream
node.timeDependent = true;
const frameRate = node.numberIn('frameRate', 30);
const operationIn = node.selectIn('camera', [], '0');
const imageOut = node.imageOut('image');

let _video, _stream, _timer, _framebuffer, shouldLoad, videoDevices, deviceMap = {};

node.onStart = async () => {
  shouldLoad = false;
  try {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = allDevices.filter(device => device.kind === 'videoinput');
    operationIn.options = videoDevices.map((device, index) => {
      const label = device.label;
      deviceMap[label] = device.deviceId;
      return label;
    });
    const firstDeviceId = videoDevices[0].deviceId;
    await startStream(firstDeviceId);
    _framebuffer = new figment.Framebuffer(_video.width, _video.height);
    _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
    shouldLoad = true;
  } catch (err) {
    console.error('No camera input!', err.name);
  }
};

async function startStream(deviceId) {
  try {
    if (_stream && _stream.active) {
      _stream.getTracks().forEach(track => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });
    if (!_video) {
      _video = document.createElement('video');
      _video.width = 1280;
      _video.height = 960;
    }
    _video.srcObject = stream;
    _video.play();
    _stream = stream;
    console.log('Stream started:', stream);
  } catch (err) {
    console.error('Failed to start camera input:', err.name);
  }
}

node.onRender = () => {
  if (!_video || !_framebuffer || _video.readyState !== _video.HAVE_ENOUGH_DATA || !shouldLoad) return;
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
    _stream.getTracks().forEach(track => track.stop());
    _video = null;
  }
};

function setShouldLoad() {
  shouldLoad = true;
}

async function updateSource() {
  const selectedLabel = operationIn.value; 
  const selectedDeviceId = deviceMap[selectedLabel];
  if (selectedDeviceId) {
    console.log("Switching video source to:", selectedLabel, selectedDeviceId);
    await startStream(selectedDeviceId);
  } else {
    console.error("Invalid device selection");
  }
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(setShouldLoad, 1000 / frameRate.value);
};

operationIn.onChange = updateSource;
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
const detectedOut = node.booleanOut('detected');

let _faceMesh, _canvas, _ctx, _framebuffer, _imageData, _results, _isProcessing;

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts([
    \`${ASSETS_PATH}/mediapipe/drawing_utils.js\`,
    \`${ASSETS_PATH}/mediapipe/face_mesh.js\`,
  ]);
  _faceMesh = new FaceMesh({locateFile: (file) => {
    return \`${ASSETS_PATH}/mediapipe/\${file\}\`;
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
  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.multiFaceLandmarks) {
    detectedOut.set(_results.multiFaceLandmarks.length > 0);
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
  } else {
    console.log('no faces');
    detectedOut.set(false);
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
const detectedOut = node.booleanOut('detected');

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
    \`${ASSETS_PATH}/mediapipe/drawing_utils.js\`,
    \`${ASSETS_PATH}/mediapipe/pose.js\`
  ]);
  const pose = new Pose({locateFile: (file) => {
    return \`${ASSETS_PATH}/mediapipe/\${file}\`;
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
  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.poseLandmarks) {
    detectedOut.set(true);
    _ctx.fillStyle = 'white';
    _ctx.beginPath();
    if (linesToggleIn.value) {
      drawConnectors(_ctx, _results.poseLandmarks, POSE_CONNECTIONS, {color: figment.toCanvasColor(linesColorIn.value), lineWidth: linesWidthIn.value, visibilityMin: 0});
    }
    if (pointsToggleIn.value) {
      drawLandmarks(_ctx, _results.poseLandmarks, {color: figment.toCanvasColor(pointsColorIn.value), lineWidth: pointsRadiusIn.value});
    }
  } else {
    detectedOut.set(false);
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
    \`${ASSETS_PATH}/mediapipe/pose.js\`
  ]);
  const pose = new Pose({locateFile: (file) => {
    return \`${ASSETS_PATH}/mediapipe/\${file}\`;
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

ml.detectHands = `// Detect the hands in an image.
const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');

let _framebuffer, _canvas, _ctx, _hands, _results, _isProcessing;

node.onStart = async (props) => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts([
    \`${ASSETS_PATH}/mediapipe/drawing_utils.js\`,
    \`${ASSETS_PATH}/mediapipe/hands.js\`
  ]);
  const hands = new Hands({locateFile: (file) => {
    return \`${ASSETS_PATH}/mediapipe/\${file}\`;
    // return \`https://cdn.jsdelivr.net/npm/@mediapipe/hands/\${file}\`;
  }});
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  _hands = hands;
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    _hands.onResults((results) => {
      _hands.onResults(null);
      _isProcessing = false;
      resolve(results);
    });
    _hands.send({ image });
  });
}

node.onRender = async () => {
  if (!imageIn.value) return;
  if (!_hands) return;
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
  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.multiHandLandmarks) {
    detectedOut.set(_results.multiHandLandmarks.length > 0);
    for (const landmarks of _results.multiHandLandmarks) {
      _ctx.fillStyle = 'white';
      _ctx.beginPath();
      if (linesToggleIn.value) {
        drawConnectors(_ctx, landmarks, HAND_CONNECTIONS, {color: figment.toCanvasColor(linesColorIn.value), lineWidth: linesWidthIn.value, visibilityMin: 0});
      }
      if (pointsToggleIn.value) {
        drawLandmarks(_ctx, landmarks, {color: figment.toCanvasColor(pointsColorIn.value), lineWidth: pointsRadiusIn.value});
      }
    }
  } else {
    detectedOut.set(false);
  }
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}
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
