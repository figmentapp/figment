/**
 * @name Out
 * @description Signifies that this is the output of the network.
 * @category core
 */

const imageIn = node.imageIn('in');
const statsIn = node.toggleIn('show stats', false);
const imageOut = node.imageOut('out');

function syncStats() {
  const el = window.stats?.dom;
  if (!el) return;
  if (statsIn.value && !el.parentNode) {
    document.body.appendChild(el);
  } else if (!statsIn.value && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

node.onStart = syncStats;

node.onRender = () => {
  imageOut.set(imageIn.value);
};

statsIn.onChange = syncStats;
