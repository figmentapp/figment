---
title: 'segment pose'
---

## Segment Pose

Isolate a single person from the background, either removing or keeping only the background.

## Parameters

- **Remove** Whether to remove the background or the foreground.

## Model

Uses the MediaPipe pose landmarker models, run on the GPU through ONNX Runtime. The MediaPipe library itself is not used.
