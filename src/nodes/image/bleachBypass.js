/**
 * @name Bleach Bypass
 * @description Bleach bypass shader
 * @category image
 */

const fragmentShader = `
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
`;

const imageIn = node.imageIn('in');
const opacityIn = node.numberIn('opacity', 1.0, { min: 0.0, max: 2.0, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_opacity: opacityIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
