/**
 * @name Out
 * @description Signifies that this is the output of the network.
 * @category core
 */

const imageIn = node.imageIn('in');
const statsIn = node.toggleIn('show stats', false);
const displayIn = node.selectIn('screen', [], 'Primary');
const imageOut = node.imageOut('out');

window.desktop.listDisplays().then((displays) => {
  const displayLabels = displays.map((d) => (+d.primary ? `0 - primary (${d.size})` : `${d.index} - ${d.size}`));
  displayIn.options = displayLabels;
  displayIn.defaultValue = displayLabels[0];
  displayIn.value = displayLabels[0];
});

node.onRender = () => {
  imageOut.set(imageIn.value);
};

statsIn.onChange = () => {
  if (statsIn.value) {
    document.body.appendChild(window.stats.dom);
  } else {
    document.body.removeChild(window.stats.dom);
  }
};

displayIn.onChange = () => {
  const idx = parseInt(displayIn.value.split(' ')[0], 10);
  console.log(idx);
  if (Number.isNaN(idx)) return;
  try {
    if (idx === 0) {
      // Close any existing external preview, user wants it on the current window
      window.desktop.closePreviewWindow();
    } else {
      window.desktop.openPreviewWindow(idx);
    }
  } catch (err) {
    console.warn(err.message);
    alert(err.message); // crude but gets the point across
    displayIn.set(displayLabels[0]); // fall back to primary
  }
};

// Clean up when the node is removed from the graph
node.onDestroy = () => window.desktop.closePreviewWindow();
