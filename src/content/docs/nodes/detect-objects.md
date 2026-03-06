---
title: "Detect Objects"
---

# Detect Objects

This node can show the detected objects in an image. It can also mask around the detected objects. Currently, only rectangular masks are supported for performance.

This uses the [coco-ssd](https://www.npmjs.com/package/@tensorflow-models/coco-ssd) model.

This node outputs both the image and the detected objects, as a list.

## Parameters

- **Drawing Mode** Whether to draw boxes around the objects or to mask the background so only the objects remain.
- **Filter** The type of objects to filter. There are about 80 [types of objects](https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/src/classes.ts).
