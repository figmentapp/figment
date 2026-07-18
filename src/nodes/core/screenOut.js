/**
 * @name Screen Out
 * @description Show an image full screen on a connected display.
 * @category core
 */

// The output window is opened with window.open() so its document lives in the
// same renderer process as the editor. That lets the shared WebGPU device
// render straight into the window's canvas with a single blit pass per frame —
// the image never leaves the GPU and no pixels are copied through the CPU.

const imageIn = node.imageIn('in');
const openIn = node.toggleIn('open', false);
const displayIn = node.selectIn('display', ['Display 1']);
const fitIn = node.selectIn('fit', figment.FIT_MODES, 'contain');
const onTopIn = node.toggleIn('always on top', false);
const imageOut = node.imageOut('out');

let displays = [];
let outputWindow = null; // WindowProxy returned by window.open
let blitter = null;
let frameName = null;
let unsubDisplays = null;
let unsubClosed = null;

function syncOpenValue(value) {
  if (openIn.value === value) return;
  openIn.value = value;
  window.app?.getState().forceRedraw();
}

function updateDisplayOptions() {
  const options = figment.displayOptionLabels(displays);
  const wasDefault = displayIn.hasDefaultValue();
  displayIn.options = options;
  // Normalize the stored value to the matching option label (projects saved on
  // another machine keep their "Display N" choice even when monitor names
  // differ). A value pointing at a disconnected display is left untouched so
  // the choice is restored when the display comes back.
  if (displayIn._value.type === 'value' && options.length > 0) {
    const idx = figment.resolveDisplayIndex(displayIn.value);
    if (idx < options.length) {
      if (wasDefault) displayIn.defaultValue = options[idx];
      if (displayIn.value !== options[idx]) displayIn.value = options[idx];
    }
  }
  window.app?.getState().forceRedraw();
}

function drawOutput() {
  if (!blitter || !outputWindow || outputWindow.closed) return;
  if (!figment.getDevice()) return;
  const dpr = outputWindow.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(outputWindow.innerWidth * dpr));
  const h = Math.max(1, Math.round(outputWindow.innerHeight * dpr));
  const canvas = blitter.canvas;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const img = imageIn.value;
  if (img && img.texture) {
    blitter.draw(img, fitIn.value);
  } else {
    blitter.clear();
  }
}

async function applyWindowConfig() {
  if (!outputWindow || outputWindow.closed || !frameName) return;
  if (displays.length === 0) return;
  const idx = Math.min(figment.resolveDisplayIndex(displayIn.value), displays.length - 1);
  const display = displays[idx];
  try {
    await window.desktop.configureOutputWindow(frameName, {
      displayId: display.id,
      alwaysOnTop: onTopIn.value,
    });
  } catch (err) {
    console.error('Screen Out: could not configure output window:', err);
  }
  drawOutput();
}

function onOutputKeyDown(e) {
  if (e.key === 'Escape') {
    closeWindow();
    syncOpenValue(false);
  }
}

function openWindow() {
  if (outputWindow && !outputWindow.closed) return;
  if (!figment.getDevice()) {
    node.error = 'GPU device not ready';
    return;
  }
  frameName = `figment-output-${node.id}-${Math.random().toString(36).slice(2, 8)}`;
  const child = window.open('about:blank', frameName);
  if (!child) {
    frameName = null;
    node.error = 'Could not open output window';
    return;
  }
  outputWindow = child;
  const doc = child.document;
  doc.title = `Figment — ${node.name}`;
  doc.documentElement.style.background = '#000';
  doc.body.style.cssText = 'margin:0;background:#000;overflow:hidden;cursor:none;';
  const canvas = doc.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;';
  doc.body.appendChild(canvas);
  try {
    blitter = figment.createCanvasBlitter(canvas, { label: `screen out ${node.id}` });
  } catch (err) {
    child.close();
    outputWindow = null;
    frameName = null;
    node.error = `Could not initialize output window: ${err.message}`;
    return;
  }
  child.addEventListener('resize', drawOutput);
  child.addEventListener('keydown', onOutputKeyDown);
  node.error = null;
  applyWindowConfig();
}

function closeWindow() {
  blitter?.destroy();
  blitter = null;
  if (outputWindow && !outputWindow.closed) outputWindow.close();
  outputWindow = null;
  frameName = null;
}

node.onStart = async () => {
  displays = await window.desktop.getDisplays();
  updateDisplayOptions();
  unsubDisplays = window.desktop.onDisplaysChanged((newDisplays) => {
    displays = newDisplays;
    updateDisplayOptions();
    applyWindowConfig();
  });
  unsubClosed = window.desktop.onOutputWindowClosed((closedName) => {
    if (!frameName || closedName !== frameName) return;
    // Window was closed externally (e.g. Cmd+W), not through closeWindow().
    blitter?.destroy();
    blitter = null;
    outputWindow = null;
    frameName = null;
    syncOpenValue(false);
  });
  if (openIn.value) openWindow();
};

node.onRender = () => {
  imageOut.set(imageIn.value);
  drawOutput();
};

node.onStop = () => {
  if (unsubDisplays) unsubDisplays();
  unsubDisplays = null;
  if (unsubClosed) unsubClosed();
  unsubClosed = null;
  closeWindow();
};

openIn.onChange = () => {
  if (openIn.value) openWindow();
  else closeWindow();
};

displayIn.onChange = () => {
  applyWindowConfig();
};

fitIn.onChange = () => {
  drawOutput();
};

onTopIn.onChange = () => {
  applyWindowConfig();
};
