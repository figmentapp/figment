---
title: "Image to Image"
---

# Image to Image

Run a PIX2PIX image to image model. Note that there is also a ONNX version of this node: [ONNX Image Model](onnx-image-model.md).

This currently only runs 512x512 image models. We're working on a version that supports smaller image models as well.

To work well, it needs an input that is similar to what it has seen in training; e.g. if you trained it on a hand model, you need to feed it hand models with the same color and line thickness.

## Parameters

- **Model** The directory of the model. Note that this is the **directory** (often called `tfjs`), not a file in the directory.
