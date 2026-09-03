/**
 * @name Normalize Face
 * @description Scale and move face landmarks to match the face a model was trained on.
 * @category ml
 */

// The face flavor of Normalize Pose: the anchor is the centre between the
// outer eye corners and the size is their distance. See
// src/landmark-normalize.js.

figment.createNormalizeNode(node, figment.FACE_RECIPE, { draw: figment.skeletonImage });
