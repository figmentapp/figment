---
title: "Crop"
---

# Crop

Crops the input image to the defined size.

## Parameters

- **Width** The target crop width.
- **Height** The target crop height.
- **Anchor** Controls the position of the crop area within the input image. Options include:
  - `top-left` - Crop from the top-left corner
  - `top-center` - Crop from the top center
  - `top-right` - Crop from the top-right corner
  - `center-left` - Crop from the center left
  - `center` - Crop from the center (default)
  - `center-right` - Crop from the center right
  - `bottom-left` - Crop from the bottom-left corner
  - `bottom-center` - Crop from the bottom center
  - `bottom-right` - Crop from the bottom-right corner
- **Output Size** Determines the output behavior:
  - `cropped` - Output dimensions match the crop size (width × height). The cropped area is zoomed to fill the output.
  - `original` - Output dimensions match the input image. Areas outside the crop are made transparent (masked out).
