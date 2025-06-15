/**
 * @name Chromatic
 * @description Adds chromatic abberation to input image.
 * @category image
 */

const fragmentShader = `
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
`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('factor', 0.05, { min: 0.0, max: 0.2, step: 0.001 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_factor: factorIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
