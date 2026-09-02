---
title: 'Detect Pose'
---

# Detect Pose

Detect one or more human poses in the input image and draw them as skeletons on a solid background. The node runs the MediaPipe pose detector and pose landmark models on the GPU through ONNX Runtime; the MediaPipe library itself is not used. Only the landmark coordinates come back, 33 per person.

Connect the **landmarks** output to a [Send OSC](/docs/nodes/send-osc) node to send the landmarks to another application. To cut people out of the image instead of drawing them, use [Segment Pose](/docs/nodes/segment-pose).

## Parameters

- **Background** The color that fills the output image behind the drawing.
- **Coloring** `solid` draws every point and line in the colors below. `per limb` gives each landmark and each limb a fixed color, so the left and right sides and every limb are distinguishable by hue. Use `per limb` when the drawing is the input of an image-to-image model such as pix2pix: the model can then tell which limb is which. The point and line colors are ignored in this mode. The palette is borrowed from OpenPose, so the look is familiar; the drawing is not a drop-in replacement for an OpenPose render.
- **Draw Points** Draw each landmark as a dot.
- **Color** (points) The color of the dots.
- **Radius** The size of the dots.
- **Draw Lines** Connect the landmarks of each pose with lines.
- **Color** (lines) The color of the lines.
- **Line Width** The thickness of the lines.
- **Number of Poses** The maximum number of people to detect, from 1 to 4. Each extra person costs one more landmark pass.
- **Model** The size of the landmark model: `lite`, `full`, or `heavy`. Larger models are more accurate and slower. Switching the model reloads it; the node keeps running the current model until the new one is ready.
- **Mode** `video` follows each person from frame to frame and only runs the detector again when a person is lost. This is faster and steadier for a webcam or movie. `still` runs the detector on every frame. Use it for unrelated images, such as a Load Image Folder.
- **Smoothing** Filters the landmarks over time in `video` mode so they stop jittering. `0` is off. Higher values are steadier but add a little lag on fast movement; the filter follows fast motion more closely than slow motion, so around `0.65` (the strength MediaPipe uses) is a good starting point. The drawn skeleton and the **Landmarks** output are both smoothed. Has no effect in `still` mode.

## Outputs

- **Out** The drawing on the background color, at the size of the input image.
- **Detected** `true` while at least one person is in the frame.
- **Landmarks** An object with `type: 'pose'` and a `landmarks` array with one entry per person. Each entry is a list of points with `x`, `y`, and `z` normalized to the image (0 to 1) and a `visibility` score. The output is `null` when nobody is detected.
