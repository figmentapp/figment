---
title: 'Segment Image'
---

# Segment Image

Isolate a person from the background of the input image, either removing or keeping only the background. Works on any image; it does not need a detected pose (compare [Segment Pose](/docs/nodes/segment-pose)).

The segmentation runs MediaPipe's selfie segmenter model on the GPU through ONNX Runtime, so the image never leaves the GPU.

## Parameters

- **Remove**: Whether to remove the background or the foreground.
- **Output Type**: `categoryMask` gives a hard edge (each pixel is either person or background); `confidenceMasks` keeps the model's probability, for soft edges.

## Outputs

- **Out**: The input image with the selected part made transparent.
- **Mask**: The person mask as a grayscale image (white is person).
