---
title: 'Normalize Face'
---

# Normalize Face

Scale and move the landmarks from [Detect Faces](/docs/nodes/detect-faces) so the face on screen has the size and position of the face a face-to-image model was trained on. It is [Normalize Pose](/docs/nodes/normalize-pose) for faces: the anchor is the centre between the outer eye corners and the size is the distance between them. Read that page for how the measuring works and where the reference values come from; the measuring graph is `Load Movie` → `Detect Faces` → `Normalize Face`.

All values are in landmark units, fractions of the image from 0 to 1 with the origin top left.

## Parameters

- **Reference Eye Center Y**, **Reference Eye Distance**, **Reference Eye Center X** Where the eye centre was and how far apart the eyes were in the training frames.
- **Horizontal** `treadmill` (the default) puts the eye centre on the reference x on every frame, because a face model is usually trained on a centred face while a guest's face wanders. `keep` only zooms; `follow` removes a slow drift but keeps the movement within the window. See Normalize Pose.
- **Measure**, **Window**, **Measure Again** How and how long the node measures the guest, and the button that starts over; see Normalize Pose. All three values are medians over the window.
- **Driver Eye Center Y**, **Driver Eye Distance**, **Driver Eye Center X** The guest's measurements, used only in `manual` mode.
- **Width**, **Height**, **Background**, **Coloring**, **Draw Points**, **Draw Lines** and their colors and sizes: the drawing parameters, as on [Draw Landmarks](/docs/nodes/draw-landmarks). Faces are drawn with the face contours.

## Outputs

- **Out** The drawing of the transformed landmarks, for the [ONNX Image Model](/docs/nodes/onnx-image-model) node.
- **Landmarks** The same object as the input, with every face transformed.
- **Measured Eye Center Y**, **Measured Eye Distance**, **Measured Eye Center X** The current estimate for the first face.
