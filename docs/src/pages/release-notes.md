---
title: Release Notes
description: "What's new in Figment"
layout: ../layouts/ContentLayout.astro
---

# Release Notes

## Version 0.8.0 (2026-09-01)

- Segment Image now runs on the GPU through ONNX Runtime like the other ML nodes, and gains a `mask` output. Its `model` parameter is gone: only the selfie model ever shipped.
- Detect Pose, Detect Hands, Detect Faces and Receive Rokoko draw their overlays on the GPU instead of uploading a canvas every frame.
- Removed the MediaPipe runtime; the app is about 11 MB smaller. The ML nodes keep using MediaPipe's models, converted to ONNX.
- Breaking change for custom code nodes: `window.mediapipe` and `window.drawing_utils` no longer exist. `drawConnectors` and `drawLandmarks` stay available as globals, and the landmark connection tables are exposed as `figment.POSE_CONNECTIONS`, `figment.HAND_CONNECTIONS`, `figment.FACE_LANDMARKS_CONTOURS` and `figment.FACE_LANDMARKS_TESSELATION`.

## Version 0.7.3 (2026-05-21)

- Added Projection Quad node for projection mapping.
- Added Smooth node for temporal smoothing of images.
- Segment Pose now tracks up to 4 people, and outputs a fully transparent frame when no one is detected.
- Added undo/redo for all network-mutating actions.
- Added a performance overlay showing rolling averages of tracked timings (toggle with Cmd/Ctrl+Shift+P).

## Version 0.7.2 (2026-03-13)

- Added Drawing node with external browser canvas for freehand drawing.
- Fixed boolean ports getting stuck after disconnection.
- Defaulted to PNG extension in save image dialog.
- ONNX node now properly re-processes after async model loading and inference.
- Fixed full-screen viewer WGSL shader errors and aspect ratio issues.
- Fixed npm audit vulnerabilities.
- Updated logo from WebGL to WebGPU.

## Version 0.7.1 (2026-03-10)

- ONNX Image Model now reads image dimensions from the model instead of assuming 512×512.
- ONNX inference is now non-blocking, keeping the UI responsive during model processing.
- Async ONNX errors now surface to the node error display.
- Export performance improved: image encoding runs in a parallel Web Worker with frame overlap.
- Fixed export not looping shorter videos in Load Movie node.
- Fixed export readback reentrancy issue.
- Optimized GPU data path for ONNX and MediaPipe nodes.
- Migration dialog now offers Close/Open Anyway options and saves converted files with a `_converted` suffix.
- Replaced react-color and lodash with lighter alternatives, reducing bundle size.
- Fixed port validation and connection bugs.

## Version 0.7.0 (2026-03-07)

- Figment now uses WebGPU for all nodes, giving a significant performance boost.
- Existing projects will be automatically migrated to the new file format through an online AI-driven converter.
- You can also convert manually using <https://migration.figmentapp.com>.

## Version 0.6.3 (2025-12-11)

- Load movie now has a "quality" setting. "fast" videos play well but are not frame-perfect. "Accurate" use MediaBunny and are frame-perfect.
- Crop node now has a "cropped" and "original" output mode. Original output mode keeps the same size but masks out the area outside the crop.

## Version 0.6.2 (2025-12-11)

- Trail node is now fixed.
- Fixed a regression where port tooltips wouldn't appear when dragging.
- Tried fixing the documentEditedBug again.

## Version 0.6.1 (2025-12-09)

- You can "auto-connect" a node by dragging from the output port of an existing node to an empty space.
- MIDI devices now support "hot swapping" and are shown in the project settings dialog.
- Send OSC now sends clean OSC data for all "detect" nodes (Detect Pose, Detect Hands, Detect Faces)
- Trail node has a "mix" and "fade" parameters that gradually.
- Add more control to the Vignette node and make the vignettes softer.
- Fix a bug that showed an error on Mac when closing the document too fast.
- Fix a bug where you could connect a node to itself.

## Version 0.6.0 (2025-10-22)

- Use new Media Pipe Solutions framework that allows tracking of multiple bodies, faces, and hands.
- Performance improvements in ONNX Image Model node.
- Audio nodes: add "Audio Spectrum" and "Audio Waveform" nodes that can visualize audio input.
- Migrate to functional components and Zustand.
- LoadMovie: output current frame and frame count.
- Use WebCodecs API for video decoding, giving frame-perfect export.
- Export dialog now auto-fills the frame count and FPS.
- Fix issue with sidebar and color picker not aligning.
- Fix UI bugs with multiple code tabs.
- Show warning when closing changed files.
- Save Image node now takes a boolean flag which determines when to save files.

## Version 0.5.8 (2025-09-05)

- Add support for MIDI messages.
- Receive realtime data from Rokoko Studio and display it in the viewport.

## Version 0.5.8 (2025-09-05)

- Add support for MIDI CC input for realtime control.

## Version 0.5.7 (2025-06-18)

- Nodes with errors show red in the network view.
- Add Shortcut Trigger node that can react to global keyboard shortcuts.
- Load Movie node can react to input from the Shortcut Trigger node.
- Face/Hands/Pose detection/segmentation: recover from MediaPipe crashes
- Parameter editor: show range indicator for number parameters.

## Version 0.5.6 (2025-06-14)

- Disable background throttling in Electron.
- Add support for OSC bundle messages.
- Upgrade to Electron 36.4.0, React 19.1.0, Three.js 0.177.0, Tailwind 4.0.3, Vite 6.3.5.

## Version 0.5.5 (2024-09-20)

- Errors in Mediapipe (Detect Pose, Detect Hands, Detect Face) nodes no longer crash the app.
- Mediapipe detection nodes now output all landmarks as well.
- Object ports are displayed in the network editor.
- Send OSC node can send pose data.

## Version 0.5.4 (2024-08-30)

- Network: show the output size of each node (width ⨉ height).
- Viewer: don't stretch the output of the `Out` node.
- Crop node: add better implementation.
- Simplify different pixelate nodes (`Pixelate`, `Pixel Size`, `Squares`) into a single node.
- ONNX image node: fix race condition.

## Version 0.5.3 (2024-08-29)

- Webcam node: you can choose which node to view.
- Add support for ONNX image to image models.
- Update to Electron 32.0.1, TensorFlow.js 4.20.0.

## Version 0.5.2 (2024-03-08)

- You can now double-click `.fgmt` files to open them.
- Forked nodes now clearly show they have changed and show a "build" button.
- "Build" shortcut has been changed to Shift-Enter.
- Fix for toggle parameter not showing context menu.
- Visual tweaks to dialogs.

## Version 0.5.1 (2024-03-06)

- Add more expression functions: `abs`, `pow`, `sqrt`, `sin`, `cos`, `tan`, `pingPong`, `random`, `clamp`, `lerp`.

## Version 0.5.0 (2024-03-05)

- Add expression support. This introduces an internal change to the file format (version 2). Older files will be automatically converted to the new format.
- Add a built-in OSC server.
- Add better fonts on Windows.
- Fix parameter splitter.
- Don't maximize Figment on load.

## Version 0.4.1 (2024-02-28)

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
