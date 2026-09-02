---
title: 'Composite'
---

# Composite

The node composites two images together by using a blending mode. It needs two images (or a [Constant](./constant)) as input.

## Parameters

- **Factor**: The factor indicates how the two input images are distributed. `0.5` takes both images evenly. `0.0` refers to the first input images and `1.0` refers to the second one.
- **Operation**: The type of blending mode. The different options are `normal`, `darken`, `multiply`, `color burn` (to darken the image) | `lighten`, `screen`,`color dodge` (to lighten the image) and `hardmix`, `difference`, `exclusion`, `subtract`, `divide`.
- **Fit**: How the second image is placed on the first when their sizes differ. `contain` scales it to fit inside, `cover` scales it to fill, and `stretch` ignores the aspect ratio. The output has the size of the first image.

## Example

<img src="/img/nodes/composite.jpg" alt="Figment composite node example"/>
