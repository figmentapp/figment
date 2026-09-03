/**
 * @name Normalize Pose
 * @description Scale and move pose landmarks to match the body a model was trained on.
 * @category ml
 */

// Global pose normalization (Everybody Dance Now): the guest's skeleton is
// zoomed about their hips and ankle line until it is as tall as the
// performer's, then slid onto the performer's floor. The measuring, the
// transform and the estimator live in src/landmark-normalize.js.

figment.createNormalizeNode(node, figment.POSE_RECIPE, { draw: figment.skeletonImage });
