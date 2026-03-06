---
title: "Save Image"
---

# Save Image

This node saves its input to an image output. By default, this works in coordination with the Render/Export functionality, only saving out images when you choose `File > Render`.

Here's how that works:

- Add a "Save Image" node to the end of your node chain.
- In the properties, select the output folder.
- Optionally, change the filename template. The `#####` will be replaced with the sequence number, e.g. `image-#####.png` will turn into `image-00001.png`, `image-00002.png`, and so on.
- Go to File > Render, choose the amount of frames and frame rate.
- This will render out the "save image" node

## Parameters

- **Enable** When to save the images. By default, images are saved when rendering/exporting. Change this to "always" to also save images during normal operation. Note that this can slow down the network. Change this to "never" to disable the export.
- **Folder** Folder to image sequence
- **Template** Image filename template. The `#####` will be replaced with the sequence number, e.g. `image-#####.png` will turn into `image-00001.png`, `image-00002.png`, and so on.
