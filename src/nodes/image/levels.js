/**
 * @name Levels
 * @description Change the brightness/contrast/saturation.
 * @category image
 */

const fragmentShader = `
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
`;

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
    u_saturation: saturationIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
