# CHANGES

## Version 0.5.1 (2024-03-06)

- Add more expression functions: `abs`, `pow`, `sqrt`, `sin`, `cos`, `tan`, `pingPong`, `random`, `clamp`, `lerp`.

## Version 0.5.0 (2024-03-05)

- Add expression support. This introduces an internal change to the file format (version 2). Older files will be automatically converted to the new format.
- Add a built-in OSC server.
- Add better fonts on Windows.
- Fix parameter splitter.
- Don't maximize Figment on load.

## Version 0.4.1 (2024-02-21)

- Add stats option to "out" node.
- Upgrade to Electron 29.0.1 / Tensorflow.js 4.17.0.

## Version 0.4.0 (2023-10-06)

- Add a bunch of new nodes: gaussion blur, barrel distortion, cartoon image, Brannan filter, vignette, wrap, sepia, Instagram filters, denoise, LoG edges, glitch, INMS, RGB color clustering, Gray color clustering, color keying, glowing edges, center around gray, ASCII, screen distortion, chromatic abberation, solarize, heatmap
- Add more operations to composite node (hardmix, difference, exclusion, subtract, divide).
- Composite node now performs proper alpha blending.
- Hide cursor in fullscreen mode.
- Add a conditional image node that can switch between multiple images.
- Add conditional outputs to pose and hand detection nodes.
- Upgrade to latest version of TensorFlow.js., significantly improving performance.

## Version 0.3.13 (2022-10-28)

- New image blending modes in the composite node
- Add new mask image node

## Version 0.3.12 (2022-10-10)

- Fix export image bugs
- Image Folder node syncs up with image export

## Version 0.3.11 (2022-10-10)

- Add "Save Image" node.
- Replace export dialog with render dialog that renders all "save image" nodes.
- Add OSC implementation
- Fix connection lines
- Use a higher resolution webcam image
- Update dependencies for security
- Don't use Yarn anymore; just use npm.
- Fix bug with nodes stopping working after export.
- Support floating-point frame rates in render dialog.
- Allow all output ports to be connected.

## Version 0.3.10 (2022-06-09)

- Fix splitter behavior
- Change modcolor to modulateColor
- Make zooming in/out of the network a bit more granular
- Add Fetch Image node that can download an image from the internet

## Version 0.3.9 (2022-06-07)

- Hand detection node
- Pose / Face / Hand detection nodes can run offline (the models are included in the app).
- Pose / Face / Hand detection nodes now clear their previous outputs.

## Version 0.3.8 (2022-05-09)

- Pose detection / segmentation loads now load correctly from disk.
- Fixed a memory leak in the Image to Image model node.
- Add support for using the arrow keys in the new node dialog.
- Fix the loadImageFolder node.
- Opened files are now added correctly to "recent files".
- Add a lens distortion node.

## Version 0.3.7 (2022-02-25)

- Image to Image model (only supports 512x512 images at the moment)
- Fix infinite recursion with markNodeDirty

## Version 0.3.6 (2022-02-24)

- Use a different execution model, result in more consistent renders
- Use new face mesh model based on MediaPipe

## Version 0.3.5 (2022-02-23)

- Add canny edge detection model
- Detect pose node can also draw lines
- More stable video loading
- Upgrade Electron and Tailwind dependencies
- Add squares node (like pixelate)
- Add reduce color node
- Add detect objects node
- Default framerate of webcam node is 30FPS
- Export uses the Out node by default.
- Add full screen support

## Version 0.3.4 (2021-10-07)

- Segment pose node: fix problem with startup
- Pose detect/segment: don't hang when there is no input

## Version 0.3.3 (2021-10-06)

- Add a trail node
- Add remove background example
- Add segment pose node
- Fix bug in composite node
- Also search by description in search
- Add composite node
- Transform node allows for negative scales

## Version 0.3.2 (2021-10-03)

- Simplify node code by making sure onStart is always called.
- Add lookup node.
- Resize: set background color.

## Version 0.3.1 (2021-10-03)

- Major rewrite, focusing on visual nodes
