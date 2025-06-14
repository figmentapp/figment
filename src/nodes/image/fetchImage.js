/**
 * @name Fetch Image
 * @description Fetch an image from a URL.
 * @category image
 */

node.timeDependent = true;
const urlIn = node.stringIn('url', 'https://figmentapp.com/img/figment.png');
const refreshToggleIn = node.toggleIn('refresh', false);
const refreshTimeIn = node.numberIn('refresh time', 60.0, { min: 0, max: 9999, step: 0.1 });
const imageOut = node.imageOut('out');

let _lastTime = 0,
  _texture,
  _framebuffer,
  _program;

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
    throw new Error(`Image load error: ${err}`);
  }
};

urlIn.onChange = () => {
  _lastTime = 0;
};
