---
title: 'Detect Hands'
---

# Detect Hands

Detect one or more hands in the input image and draw them as a skeleton on a solid background. The node runs the MediaPipe hand detector and hand landmark models on the GPU through ONNX Runtime; the MediaPipe library itself is not used. Only the landmark coordinates come back, 21 per hand.

Connect the **landmarks** output to a [Send OSC](/docs/nodes/send-osc) node to send the landmarks to another application.

## Parameters

- **Background** The color that fills the output image behind the drawing.
- **Coloring** `solid` draws every point and line in the colors below. `per hand` draws a right hand in red and a left hand in cyan. `per finger` gives each finger its own hue as well, warm colors for the right hand and cool colors for the left, so no two fingers of either hand share a color. Use `per hand` or `per finger` when the drawing is the input of an image-to-image model such as pix2pix. The point and line colors are ignored in these modes. Handedness is judged from an un-mirrored image: a mirrored webcam swaps the colors.
- **Draw Points** Draw each landmark as a dot.
- **Color** (points) The color of the dots.
- **Radius** The size of the dots.
- **Draw Lines** Connect the landmarks of each hand with lines.
- **Color** (lines) The color of the lines.
- **Line Width** The thickness of the lines.
- **Number of Hands** The maximum number of hands to detect, from 1 to 4. Each extra hand costs one more landmark pass.
- **Confidence** The minimum detection score for a hand to count, from 0 to 1.

## Outputs

- **Out** The drawing on the background color, at the size of the input image.
- **Detected** `true` while at least one hand is in the frame.
- **Landmarks** An object with `type: 'hand'` and three arrays with one entry per hand: `landmarks` (points with `x`, `y`, `z` normalized to the image), `handedness` (whether the hand is a left or a right hand, with a score), and `worldLandmarks` (the same points in meters, relative to the hand's center). The output is `null` when no hand is detected.
