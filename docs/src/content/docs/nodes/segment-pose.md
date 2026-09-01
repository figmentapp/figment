---
title: 'Segment Pose'
---

# Segment Pose

Cut one or more people out of the input image, or cut them away and keep the background. The node runs the MediaPipe pose model with its segmentation head on the GPU through ONNX Runtime; the MediaPipe library itself is not used. The image and the mask never leave the GPU; only the landmark coordinates come back.

Because the segmentation follows the pose model, this node also gives you the same landmarks as [Detect Pose](/docs/nodes/detect-pose). One node can drive both a cut-out and an OSC stream.

## Parameters

- **Remove** `background` keeps the people and makes everything else transparent. `foreground` does the opposite: the people become transparent and the background stays.
- **Number of Poses** The maximum number of people to segment, from 1 to 4. The masks of all people are combined into one.
- **Model** The size of the pose model: `lite`, `full`, or `heavy`. Larger models give cleaner edges and are slower. Switching the model reloads it; the node keeps running the current model until the new one is ready.
- **Mode** `video` follows each person from frame to frame. `still` runs the detector on every frame. Use it for unrelated images, such as a Load Image Folder.

## Outputs

- **Out** The input image with the alpha channel set from the mask. When nobody is detected, `background` mode gives a fully transparent frame and `foreground` mode passes the input through unchanged.
- **Detected** `true` while at least one person is in the frame.
- **Landmarks** An array with one entry per person. Each entry is a list of 33 points with `x`, `y`, and `z` normalized to the image and a `visibility` score. The output is `null` when nobody is detected.
- **Mask** The raw segmentation mask as a grayscale image: white where a person is, black elsewhere. Use it with [Mask Image](/docs/nodes/mask) or [Composite](/docs/nodes/composite) to build your own effects. The output is empty when nobody is detected.
