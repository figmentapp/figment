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
  target;

node.onStart = () => {
  target = new figment.RenderTarget({ label: 'fetchImage' });
};

node.onRender = async () => {
  if (!urlIn.value || urlIn.value.trim() === '') return;
  const timePassedSeconds = (Date.now() - _lastTime) / 1000;
  if (timePassedSeconds < refreshTimeIn.value || (!refreshToggleIn.value && _lastTime !== 0)) return;
  _lastTime = Date.now();
  try {
    const url = new URL(urlIn.value);
    url.searchParams.set('__cache', Date.now());
    const response = await fetch(url.toString());
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    target.setSize(bitmap.width, bitmap.height);
    target.uploadExternal(bitmap);
    bitmap.close();
    imageOut.set(target);
  } catch (err) {
    throw new Error(`Image load error: ${err}`);
  }
};

node.onStop = () => {
  target?.destroy();
};

urlIn.onChange = () => {
  _lastTime = 0;
};
