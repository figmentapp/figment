---
title: 'Drawing'
---

# Drawing

Draw by hand into an image that the rest of the network can use. The node opens a canvas in your web browser; every stroke you make there shows up in Figment on the next frame.

A typical use is to sketch the input for a machine learning node, such as [ONNX Image Model](/docs/nodes/onnx-image-model), and watch the model respond while you draw.

## How to use it

- Add a **Drawing** node and set the **Width** and **Height** of the canvas.
- Click **Open Drawing**. The canvas opens in your default browser.
- Pick a brush size (2, 4, or 8 pixels) and a color (white or black) from the toolbar, then draw.
- The trash button in the browser and the **Clear** button on the node both wipe the canvas.

The canvas starts black. Changing the size clears it.

## Parameters

- **Width** and **Height** The size of the canvas in pixels.
- **Open Drawing** Open the canvas in the browser. You can open it again at any time; the drawing is kept.
- **Clear** Wipe the canvas.

## Outputs

- **Image** The current drawing.
