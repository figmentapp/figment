---
title: 'Segment Image'
---

# Segment Image

Cut the person out of the input image with the MediaPipe Image Segmenter, or cut the person away and keep the background. Unlike [Segment Pose](/docs/nodes/segment-pose), this node does not need a full body in view: it works on portraits and close-ups.

This node reads the image back from the GPU for every frame, so it is slower than Segment Pose. Prefer Segment Pose for live video when the whole body is visible.

## Parameters

- **Remove** `background` keeps the person and makes everything else transparent. `foreground` does the opposite.
- **Model** The segmentation model. Only `selfie` ships with Figment. The other entries in the list are placeholders.
- **Output Type** `categoryMask` gives a hard edge: every pixel is either person or background. `confidenceMasks` uses the model's soft probability for a softer edge.

## Outputs

- **Out** The input image with the alpha channel set from the mask.
