---
title: 'Heatmap'
---

# Heatmap

Color the image in five depth bands: blue for the nearest, then cyan, magenta, yellow, and red for the farthest. The node reads the red channel of the input as a disparity value and converts it to depth, so it is meant for the output of a depth estimation model, such as one loaded in the [ONNX Image Model](/docs/nodes/onnx-image-model) node. On a normal photo it colors by brightness.

## Parameters

- **Focal Length** The focal length used in the disparity-to-depth conversion.
- **Disparity Scale** Scales the red channel before the conversion.
- **Depth Min** and **Depth Max** The depth range that the five bands cover. Depths below the minimum are blue, depths above the maximum are red.

## Example

<img src="/img/nodes/heatmap.jpg" alt="Figment heatmap node example"/>
