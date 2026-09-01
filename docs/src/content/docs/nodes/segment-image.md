---
title: 'Segment Image'
---

# Segment Image

Cut the person out of the input image with MediaPipe's selfie segmenter, or cut the person away and keep the background. Unlike [Segment Pose](/docs/nodes/segment-pose), this node does not need a full body in view: it works on portraits and close-ups.

The model runs on the GPU through ONNX Runtime; the image and the mask never leave the GPU.

## Parameters

- **Remove** `background` keeps the person and makes everything else transparent. `foreground` does the opposite.
- **Output Type** `categoryMask` gives a hard edge: every pixel is either person or background. `confidenceMasks` keeps the model's probability for a softer edge.

## Outputs

- **Out** The input image with the alpha channel set from the mask.
- **Mask** The person mask as a grayscale image: white where the person is, black elsewhere. Use it with [Mask Image](/docs/nodes/mask) or [Composite](/docs/nodes/composite) to build your own effects.
