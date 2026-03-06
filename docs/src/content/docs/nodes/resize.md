---
title: "Resize"
---

# Resize

Resize the incoming image to the given size. The resize node can use different ways of fitting the content in the target size if they do not match the aspect:

- **Fill**: The image will be stretched so it fits the image size exactly.
- **Contain**: The image will fit in the target size without stretching, taking the smallest size and filling the rest with the background color.
- **Cover**: The image will cover the target size, removing the left/right side or top/bottom side to fill the entire frame.

## Parameters

- **Width**: The target width, in pixels.
- **Height**: The target height, in pixels.
- **Fit**: The method to fit the image in the target size.
- **Background**: The background color to use if the method is set to `contain`.
