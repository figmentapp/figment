/**
 * @name Load Image Folder
 * @description Load a folder of images.
 * @category image
 */

node.timeDependent = true;
const folderIn = node.directoryIn('folder', '');
const filterIn = node.stringIn('filter', '*.jpg');
const sortByIn = node.selectIn('sortBy', ['alphabetical', 'created', 'modified'], 'alphabetical');
const orderIn = node.selectIn('order', ['ascending', 'descending'], 'ascending');
const animateIn = node.toggleIn('animate', false);
const frameRateIn = node.numberIn('frameRate', 10, { min: 1, max: 60 });
const imageOut = node.imageOut('out');

const LOAD_STATE_NONE = 0;
const LOAD_STATE_LOADING = 1;
const LOAD_STATE_LOADED = 2;

let _loadState, _files, _fileIndex, target, _lastTime;

node.onStart = () => {
  target = new figment.RenderTarget({ label: 'loadImageFolder' });
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
    const exportFps = window.desktop.getExportFps() || 1;
    const exportTime = (window.desktop.getCurrentFrame() - 1) / exportFps;
    _fileIndex = Math.floor(exportTime * frameRateIn.value) % _files.length;
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

  if (target.texture) {
    imageOut.set(target);
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
    _files = await window.desktop.globFiles(baseDir, filterIn.value, {
      sortBy: sortByIn.value,
      order: orderIn.value,
    });
  } catch (err) {
    _files = [];
    _loadState = LOAD_STATE_LOADED;
    return;
  }
  _fileIndex = -1;
  _loadState = LOAD_STATE_LOADED;
  nextImage();
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
  const file = _files[_fileIndex];
  const imageUrl = figment.urlForAsset(file);
  try {
    const response = await fetch(imageUrl.toString());
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    target.setSize(bitmap.width, bitmap.height);
    target.uploadExternal(bitmap);
    bitmap.close();
  } catch (err) {
    console.error('Image load error:', err);
  }
}

node.onStop = () => {
  target?.destroy();
};

folderIn.onChange = changeDirectory;
filterIn.onChange = changeDirectory;
sortByIn.onChange = changeDirectory;
orderIn.onChange = changeDirectory;
