/**
 * @name Brannan
 * @description Brannan instagram filter on image.
 * @category image
 */

//https://www.shadertoy.com/view/4lSyDK

const fragmentShader = `
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
`;

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
    u_saturation: satRatio.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
