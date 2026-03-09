/**
 * @name Save Image
 * @description Save the image to disk.
 * @category image
 */

const imageIn = node.imageIn('in');
const enableIn = node.booleanIn('enable', true);
const saveIn = node.selectIn('Save', ['On Export', 'Always', 'Never'], 'On Export');
const folderIn = node.directoryIn('folder', '');
const templateIn = node.stringIn('template', 'image-#####.png');
const imageQualityIn = node.numberIn('quality', 0.9, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

const state = {
  folder: null,
  baseDir: null,
  ensureDirectoryPromise: null,
  template: null,
  parsedTemplate: null,
  fallbackCanvas: null,
  fallbackCtx: null,
  fallbackWidth: 0,
  fallbackHeight: 0,
};

function ensureParsedTemplate(template) {
  if (state.template === template && state.parsedTemplate) {
    return state.parsedTemplate;
  }

  state.template = template;
  state.parsedTemplate = figment.parseSaveImageTemplate(template);
  return state.parsedTemplate;
}

async function ensureBaseDirectory(folder) {
  const baseDir = figment.filePathForAsset(folder);
  if (state.baseDir === baseDir && state.ensureDirectoryPromise) {
    await state.ensureDirectoryPromise;
    return baseDir;
  }

  state.folder = folder;
  state.baseDir = baseDir;
  state.ensureDirectoryPromise = figment.ensureDirectory(baseDir);
  await state.ensureDirectoryPromise;
  return baseDir;
}

node.onRender = async () => {
  if (!imageIn.value) return;
  imageOut.set(imageIn.value);

  if (!enableIn.value) return;
  if (saveIn.value === 'Never') return;
  const runtimeMode = window.desktop.getRuntimeMode();
  if (saveIn.value === 'On Export' && runtimeMode !== 'export') return;

  const folder = folderIn.value;
  if (!folder) return;
  const template = templateIn.value;
  const imageQuality = imageQualityIn.value;
  const parsedTemplate = ensureParsedTemplate(template);
  const baseDir = await ensureBaseDirectory(folder);
  const currentFrame = window.desktop.getCurrentFrame();
  const filePath = figment.buildSaveImagePath(baseDir, parsedTemplate.template, currentFrame, parsedTemplate.digits);
  const rawPixels = await imageIn.value.readPixelsRaw();

  try {
    const didSave = await window.desktop.encodeAndSaveImage({
      rgbaBuffer: rawPixels.data,
      width: rawPixels.width,
      height: rawPixels.height,
      filePath,
      imageType: parsedTemplate.imageType,
      imageQuality,
    });
    if (didSave) {
      return;
    }
  } catch (err) {
    console.warn('Falling back to canvas image encoding:', err);
  }

  await figment.encodeWithCanvasFallback({
    state,
    rgba: rawPixels.data,
    width: rawPixels.width,
    height: rawPixels.height,
    filePath,
    imageType: parsedTemplate.imageType,
    imageQuality,
    saveBufferToFile: window.desktop.saveBufferToFile,
  });
};

node.onStop = () => {
  state.ensureDirectoryPromise = null;
  state.fallbackCanvas = null;
  state.fallbackCtx = null;
};
