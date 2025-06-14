/**
 * @name Load Image Folder
 * @description Load a folder of images.
 * @category image
 */

node.timeDependent = true;
const folderIn = node.directoryIn('folder', '');
const filterIn = node.stringIn('filter', '*.jpg');
const animateIn = node.toggleIn('animate', false);
const frameRateIn = node.numberIn('frameRate', 10, { min: 1, max: 60 });
const imageOut = node.imageOut('out');

const LOAD_STATE_NONE = 0;
const LOAD_STATE_LOADING = 1;
const LOAD_STATE_LOADED = 2;

let _loadState, _files, _fileIndex, _texture, _image, _framebuffer, _program, _lastTime;

node.onStart = () => {
  _program = figment.createShaderProgram();
  _framebuffer = new figment.Framebuffer();
  _fileIndex = 0;
  _lastTime = Date.now();
  _loadState = LOAD_STATE_NONE;
};

node.onRender = async () => {
  if (_loadState === LOAD_STATE_NONE) {
    loadDirectory();
  } else if (_loadState === LOAD_STATE_LOADING) {
    return;
  }

  const runtimeMode = window.desktop.getRuntimeMode();
  if (runtimeMode === 'export') {
    _fileIndex = (window.desktop.getCurrentFrame() - 1) % _files.length;
    await loadImage();
  } else {
    const deltaTime = Date.now() - _lastTime;
    if (deltaTime > 1000 / frameRateIn.value) {
      _lastTime = Date.now();
      if (animateIn.value) {
        await nextImage();
      }
    }
  }

  if (_image && _texture) {
    _framebuffer.setSize(_image.naturalWidth, _image.naturalHeight);
    _framebuffer.bind();
    figment.clear();
    figment.drawQuad(_program, { u_image: _texture });
    _framebuffer.unbind();
    imageOut.set(_framebuffer);
  }
};

function changeDirectory() {
  _loadState = LOAD_STATE_NONE;
}

async function loadDirectory() {
  _loadState = LOAD_STATE_LOADING;
  if (!folderIn.value || folderIn.value.trim().length === 0) {
    _files = [];
    _loadState = LOAD_STATE_LOADED;
    return;
  }
  const baseDir = figment.filePathForAsset(folderIn.value);
  try {
    _files = await window.desktop.globFiles(baseDir, filterIn.value);
  } catch (err) {
    onLoadError();
  }
  _fileIndex = -1;
  _loadState = LOAD_STATE_LOADED;
  nextImage();
}

function onLoadError() {
  _files = [];
  _image = null;
  _texture = null;
  const texture = figment.createErrorTexture();
  _framebuffer.setSize(100, 56);
  _framebuffer.bind();
  figment.drawQuad(_program, { u_image: texture });
  _framebuffer.unbind();
  imageOut.set(_framebuffer);
  _loadState = LOAD_STATE_LOADED;
}

function onLoadImage(err, texture, image) {
  if (err) {
    throw new Error(`Image load error: ${err}`);
  }
  _texture = texture;
  _image = image;
}

async function nextImage() {
  if (_files.length === 0) return;
  _fileIndex++;
  if (_fileIndex >= _files.length) {
    _fileIndex = 0;
  }
  await loadImage();
}

async function loadImage() {
  if (_texture) {
    window.gl.deleteTexture(_texture);
    _texture = null;
  }

  const file = _files[_fileIndex];
  const imageUrl = figment.urlForAsset(file);
  const { texture, image } = await figment.createTextureFromUrlAsync(imageUrl.toString());
  onLoadImage(null, texture, image);
}

folderIn.onChange = changeDirectory;
filterIn.onChange = changeDirectory;
