---
title: "Screen Out"
---

# Screen Out

The Screen Out node shows its input image full screen on a connected display. Use it to send output to a projector or a second monitor while you keep editing the network on your main screen — for live performances and installations. You can add multiple Screen Out nodes to drive several displays at once, each with a different part of the network.

## Parameters

- **Open**: opens or closes the output window. The setting is saved with the project, so a project saved with an open output window will open it again on launch — handy for installations that need to start up unattended.
- **Display**: which display the output window appears on. The list updates automatically when displays are connected or disconnected. If the chosen display is missing (e.g. a projector is powered off), the output temporarily falls back to the primary display and moves back automatically when the display reconnects.
- **Fit**: how the image is mapped to the screen:
  - `contain`: show the whole image, letterboxed with black if the aspect ratio differs.
  - `cover`: fill the whole screen, cropping the image if needed.
  - `stretch`: fill the whole screen, ignoring the aspect ratio.
  - `1:1`: map image pixels 1:1 to screen pixels, centered.
- **Always On Top**: keep the output window above all other windows, including the menu bar and dock.

The node passes its input image through to its output port, so you can place it anywhere in a chain — for example between the last effect and the Out node.

Press <kbd>Escape</kbd> while the output window is focused to close it.

## Performance

The output window shares the GPU context of the editor: each frame is delivered to the extra display with a single GPU draw call, without copying any pixels through the CPU. Adding output windows has virtually no impact on the frame rate of your network.
