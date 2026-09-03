/**
 * @name Draw Landmarks
 * @description Draw pose, hand or face landmarks as an image.
 * @category ml
 */

// Turns a landmarks object (from Detect Pose, Detect Hands, Detect Faces or
// a Normalize node) back into a drawing, with the same parameters and the
// same drawing code as Detect Pose (src/landmark-drawing.js), so a model
// trained on Detect Pose drawings sees the same picture.

const landmarksIn = node.objectIn('landmarks');
const image = figment.skeletonImage(node);

node.onStart = image.start;
node.onRender = () => image.render(landmarksIn.value);
node.onStop = image.stop;
