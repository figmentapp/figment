---
title: 'Draw Landmarks'
---

# Draw Landmarks

Draw a landmarks object as an image. The input is the **landmarks** output of [Detect Pose](/docs/nodes/detect-pose), [Detect Hands](/docs/nodes/detect-hands), [Detect Faces](/docs/nodes/detect-faces), [Normalize Pose](/docs/nodes/normalize-pose) or [Normalize Face](/docs/nodes/normalize-face). Those nodes draw their own image already; this node is for drawing landmarks that come from somewhere else, at another size or with other parameters. The drawing parameters and the drawing code are the ones Detect Pose uses, so a model trained on Detect Pose drawings sees the same picture here.

The connections follow the type of the object: the pose skeleton for `pose`, the hand skeleton for `hand`, and the face contours for `face`.

## Parameters

- **Width**, **Height** The size of the output image. Landmarks are fractions of the image, so any size works; use the size the model was trained on.
- **Background** The color that fills the image behind the drawing.
- **Coloring** `solid` draws every point and line in the colors below. `per limb` gives each pose landmark and limb its fixed OpenPose color, as Detect Pose does; hands and faces are drawn solid in both modes.
- **Draw Points**, **Color**, **Radius** Draw each landmark as a dot, and how.
- **Draw Lines**, **Color**, **Line Width** Connect the landmarks with lines, and how.

## Outputs

- **Out** The drawing.
