---
title: "Composite"
---

# Composite

The node composites two images together by using a blending mode. It needs two images (or a [Constant](./constant)) as input.

## Parameters

- **Factor**: The factor indicates how the two input images are distributed. `0.5` takes both images evenly. `0.0` refers to the first input images and `1.0` refers to the second one.
- **Operation**: The type of blending mode. The different options are `normal`, `darken`, `multiply`, `color burn` (to darken the image) | `lighten`, `screen`,`color dodge` (to lighten the image) and `difference`

## Example

<img src="/img/nodes/composite.jpg" alt="Figment composite node example"/>
