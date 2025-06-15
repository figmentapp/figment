/**
 * @name Out
 * @description Signifies that this is the output of the network.
 * @category core
 */

const imageIn = node.imageIn('in');
const statsIn = node.toggleIn('show stats', false);
const imageOut = node.imageOut('out');

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
