/**
 * @name Screen Distortion
 * @description Simple distortion on image.
 * @category image
 */

const fragmentShader = `
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
`;

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
    u_lines,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
