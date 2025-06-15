/**
 * @name Null
 * @description Does nothing.
 * @category image
 */

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

node.onRender = () => {
  imageOut.set(imageIn.value);
};
