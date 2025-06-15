/**
 * @name Ascii
 * @description Ascii effect on image.
 * @category image
 */

// https://www.shadertoy.com/view/4sSBDK

const fragmentShader = `
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
`;

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
    u_resolution: [imageIn.value.width, imageIn.value.height],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
