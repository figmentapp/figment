---
title: 'Save Image'
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

- **Enable** A boolean plug. Connect it to a [Conditional](/docs/nodes/conditional) or a detection node to save only while the value is `true`.
- **Save** When to save the images. `On Export` saves only during File > Render. `Always` also saves during normal operation, which can slow down the network. `Never` disables saving.
- **Folder** Folder to image sequence
- **Template** Image filename template. The `#####` will be replaced with the sequence number, e.g. `image-#####.png` will turn into `image-00001.png`, `image-00002.png`, and so on. The extension picks the format: `.png` or `.jpg`.
- **Quality** The JPEG quality from 0 to 1. PNG files ignore it.
