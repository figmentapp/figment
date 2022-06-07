# CHANGES

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
