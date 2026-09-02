---
title: 'Detect Faces'
---

# Detect Faces

Detect one or more faces in the input image and draw them on a solid background. The node runs the MediaPipe face detector and face landmark models on the GPU through ONNX Runtime; the MediaPipe library itself is not used. The image never leaves the GPU; only the landmark coordinates come back, 478 per face.

Connect the **landmarks** output to a [Send OSC](/docs/nodes/send-osc) node to send the landmarks to another application.

## Parameters

- **Background** The color that fills the output image behind the drawing.
- **Draw Mode** What to draw for each face. `contours` draws the outline of the face, eyes, eyebrows, and lips. `tesselation` draws the full face mesh. `bounding box` draws a rectangle around the landmarks.
- **Color** The drawing color.
- **Line Width** The thickness of the lines.
- **Number of Faces** The maximum number of faces to detect, from 1 to 4. Each extra face costs one more landmark pass, so keep this at the number you need.
- **Confidence** The minimum detection score for a face to count, from 0 to 1. Raise it to reject false detections, lower it to keep faces at difficult angles.
- **Mode** `video` follows each face from frame to frame and only runs the detector again when a face is lost. This is faster and steadier for a webcam or movie. `still` runs the detector on every frame. Use it for unrelated images, such as a Load Image Folder.
- **Smoothing** Filters the landmarks over time in `video` mode so they stop jittering. `0` is off. Higher values are steadier but add a little lag on fast movement; the filter follows fast motion more closely than slow motion, so around `0.65` (the strength MediaPipe uses) is a good starting point. The drawing and the **Landmarks** output are both smoothed. Has no effect in `still` mode.

## Outputs

- **Out** The drawing on the background color, at the size of the input image.
- **Detected** `true` while at least one face is in the frame.
- **Landmarks** An object with `type: 'face'` and a `landmarks` array with one entry per face. Each entry is a list of points with `x`, `y`, and `z` normalized to the image (0 to 1). The output is `null` when no face is detected.

## Example

The [PIX2PIX tutorial](/docs/tutorials/pix2pix) uses this node with the `tesselation` draw mode to turn photos of faces into training data.
