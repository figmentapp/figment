/**
 * @name Instagram Filters
 * @description Instagram filters on image.
 * @category image
 */

const fragmentShader = `
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
`;

const imageIn = node.imageIn('in');
const directionIn = node.selectIn('Filter', ['Amaro', 'Clarendon', 'Juno', 'Lark', 'Nashville', 'Valencia', 'None']);
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_selector });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
