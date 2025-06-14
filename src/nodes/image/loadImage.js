/**
 * @name Load Image
 * @description Load an image from a file.
 * @category image
 */

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
    throw new Error(`Image load error: ${err}`);
  }
};
