---
title: "Exporting"
---

# Exporting

Use `File > Export` to export a sequence of images to disk. The export dialog will save all [Save image](/docs/nodes/save-image) nodes, so make sure you have those in your network.

:::tip
Exporting will not work if you don't have any **Save Image** nodes in your network.
:::

## Frame rate

Because input nodes can have different settings, we set a _frame rate_ to give an indication of the speed at which to export. As an example, exporting 60 frames at a frame rate of 30fps would export a 2 second sequence. The frame rate is important for real-time nodes like webcam, because it will try to capture that many frames per second, if it can.

## Options

Export takes a number of options:

- **Node** The node to export. Defaults to the Out node.
- **Frames** The amount of frames to export.
- **Frame rate** The frame rate to export, e.g. exporting 60 frames at a frame rate of 30fps would export a 2 second sequence.
- **Folder** The folder to export to
- **Prefix** The file prefix. Files will have this prefix and then a number, e.g. a prefix of `hands` will have files called `hands-0001.png` etc.
- **Image Format** Choose between PNG and JPEG here. PNGs are lossless, JPEGs are smaller but with a reduced quality. For machine learning we often use JPEGs with a quality setting of 90.
