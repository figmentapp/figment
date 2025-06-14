/**
 * @name Lookup
 * @description Map the colors of one image to another image.
 * @category image
 */

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
  const fragmentShader = `
  precision mediump float;
  uniform sampler2D u_source_texture;
  uniform sampler2D u_lookup_texture;
  varying vec2 v_uv;
  void main() {
    vec2 uv = v_uv;
    vec4 source = texture2D(u_source_texture, uv);
    float value = ${lookupFunction};
    vec4 lookup = texture2D(u_lookup_texture, vec2(value, 0.5));
    gl_FragColor = lookup;
  }
  `;
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
