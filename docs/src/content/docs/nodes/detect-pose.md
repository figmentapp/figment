---
title: 'Detect Pose'
---

# Detect Pose

Detect a single human pose in the input image and draw it as a skeleton-like shape.

## Parameters

- **Background**: The color of the background.
- **Draw Points**: Whether to draw the landmarks of the pose as points.
- **Points Color**: The color of the points.
- **Points Radius**: The size of the points.
- **Draw Lines**: Whether to connect the landmarks of the pose with lines.
- **Lines Color**: The color of the lines.
- **Lines Width**: The thickness of the lines.

## Model

Uses the MediaPipe pose landmarker models, run on the GPU through ONNX Runtime. The MediaPipe library itself is not used; see the `landmarks` output for the raw landmark data.
