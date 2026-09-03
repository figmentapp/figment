---
title: 'Figment Nodes'
---

# Figment Nodes

This is a list of all the nodes in Figment:

## Core

- [Null](/docs/nodes/null): Does nothing.
- [Out](/docs/nodes/out): Signifies that this is the output of the network.
- [Shortcut Trigger](/docs/nodes/shortcut-trigger): Turn a global keyboard shortcut into a boolean signal.

## Image Operations

### Creating / Loading Images

- [Constant](/docs/nodes/constant): Render a constant color.
- [Drawing](/docs/nodes/drawing): Draw by hand in a browser window.
- [Fetch Image](/docs/nodes/fetch-image): Fetch an image from the internet.
- [Load Image](/docs/nodes/load-image): Load an image from a file.
- [Load Image Folder](/docs/nodes/load-image-folder): Load a folder of images.
- [Load Movie](/docs/nodes/load-movie): Load a movie file.
- [Webcam Image](/docs/nodes/webcam-image): Return a webcam stream.

### Saving Images

- [Save Image](/docs/nodes/save-image): Save the image sequence to disk during export.

### Resizing / Cropping / Combining images

- [Resize](/docs/nodes/resize): Resize the input image.
- [Crop](/docs/nodes/crop): Crop an input image.
- [Composite](/docs/nodes/composite): Combine two images together.
- [Conditional](/docs/nodes/conditional): Pick one of two images based on a boolean.
- [Stack](/docs/nodes/stack): Combine 2 images horizontally / vertically.
- [Mask Image](/docs/nodes/mask): Mask the input image with another image.
- [Mask Ellipse](/docs/nodes/mask-ellipse): Draw a circular mask of an image or color.
- [Color Key](/docs/nodes/color-key): Make pixels of a certain color transparent.
- [Projection Quad](/docs/nodes/projection-quad): Map the image onto a four-cornered surface for projection mapping.

### Filters / Effects

The images of the examples courtesy of [John Mark Arnold](https://unsplash.com/@johnmarkarnold) and [Sergey Shmidt](https://unsplash.com/@monstercritic).

Color and tone:

- [Bleach Bypass](/docs/nodes/bleach-bypass): High-contrast, desaturated film look.
- [Brannan](/docs/nodes/brannan): Brannan filter.
- [Center Around Gray](/docs/nodes/center-around-gray): Keep the color inside a circle, grayscale outside.
- [Colorify](/docs/nodes/colorify): Repaint the image in one color.
- [Grayscale](/docs/nodes/grayscale): Convert the input image to grayscale.
- [Instagram Filters](/docs/nodes/instagram-filters): A set of Instagram-like filters.
- [Invert](/docs/nodes/invert): Invert the colors of input image.
- [Levels](/docs/nodes/levels): Change the brightness/contrast/saturation of an image.
- [Lookup](/docs/nodes/lookup): Map the colors of one image to another image.
- [Modulate Color](/docs/nodes/modulate-color): Adjust the colors of the input image.
- [Reduce Color](/docs/nodes/reduce-color): Reduce the amount of colors of input image.
- [Gray Cluster](/docs/nodes/gray-cluster): Cluster the image into a few gray levels.
- [Rgb Cluster](/docs/nodes/rgb-cluster): Cluster the image into a few colors.
- [Sepia](/docs/nodes/sepia): Sepia tone.
- [Solarize](/docs/nodes/solarize): Invert the channels above a threshold.
- [Technicolor](/docs/nodes/technicolor): Two-strip Technicolor look.
- [Threshold](/docs/nodes/threshold): Change brightness threshold of input image.
- [Vignette](/docs/nodes/vignette): Darken the edges of the image.

Blur, sharpen, and edges:

- [Blur](/docs/nodes/blur): Blur an input image.
- [Gaussian Blur](/docs/nodes/gaussian-blur): A light, cheap blur.
- [Denoise](/docs/nodes/denoise): Remove noise from the image.
- [Sharpen](/docs/nodes/sharpen): Sharpen an input image
- [Canny](/docs/nodes/canny): Canny edge detection on input image.
- [Freichen](/docs/nodes/freichen): Frei-Chen edge detection.
- [Glow Edges](/docs/nodes/glow-edges): Glowing edges.
- [INMS](/docs/nodes/inms): Intensity-based non-maximum suppression edge detection.
- [LoG](/docs/nodes/log): Laplacian of Gaussian edge detection.
- [Sobel](/docs/nodes/sobel): Sobel edge detection on input image.
- [Emboss](/docs/nodes/emboss): Emboss convolution on an input image.

Stylize:

- [Ascii](/docs/nodes/ascii): Render the image as character glyphs.
- [Cartoon](/docs/nodes/cartoon): Cartoon look.
- [Glitch](/docs/nodes/glitch): Digital glitch effect.
- [Heatmap](/docs/nodes/heatmap): Color a depth map in five bands.
- [Noise](/docs/nodes/noise): Mix random grain into the image.
- [Pixelate](/docs/nodes/pixelate): Pixelate the input image.
- [Reaction Diffusion](/docs/nodes/reaction-diffusion): Grow organic patterns seeded by the image.

Geometry and distortion:

- [Barrel Distortion](/docs/nodes/barrel-distortion): Barrel lens distortion.
- [Border](/docs/nodes/border): Generate a border around the image.
- [Chromatic](/docs/nodes/chromatic): Chromatic aberration.
- [Distortion](/docs/nodes/distortion): Distort the image.
- [Kaleidoscope](/docs/nodes/kaleidoscope): Mirror a wedge of the image around its center.
- [Lens Distortion](/docs/nodes/lens-distortion): Distort an image using a lens distortion shader.
- [Mirror](/docs/nodes/mirror): Mirror the input image over a specific axis.
- [Radial Distortion](/docs/nodes/radial-distortion): Radial lens distortion.
- [Screen Distortion](/docs/nodes/screen-distortion): Bulge the image like an old monitor.
- [Transform](/docs/nodes/transform): Transform the image.
- [Wrap](/docs/nodes/wrap): Bend the image into a circle.

Over time:

- [Difference](/docs/nodes/difference): Show what changed since the previous frame.
- [Smooth](/docs/nodes/smooth): Blend each frame with the frames before it.
- [Trail](/docs/nodes/trail): Don't erase the previous input image, creating a trail.

### Machine Learning

- [Detect Faces](/docs/nodes/detect-faces): Detect faces in an image.
- [Detect Hands](/docs/nodes/detect-hands): Detect hands in an input image.
- [Detect Pose](/docs/nodes/detect-pose): Detect human poses in input image.
- [Normalize Pose](/docs/nodes/normalize-pose): Scale and move pose landmarks to match the body a model was trained on.
- [Normalize Face](/docs/nodes/normalize-face): Scale and move face landmarks to match the face a model was trained on.
- [Draw Landmarks](/docs/nodes/draw-landmarks): Draw pose, hand or face landmarks as an image.
- [Segment Pose](/docs/nodes/segment-pose): Cut people out of an image using the pose model.
- [Segment Image](/docs/nodes/segment-image): Cut the person out of a portrait.
- [ONNX Image Model](/docs/nodes/onnx-image-model): Run your own image to image model (pix2pix).

## Audio

- [Audio Spectrum](/docs/nodes/audio-spectrum): Play audio and draw its frequency spectrum.
- [Audio Waveform](/docs/nodes/audio-waveform): Play audio and draw its waveform.

## Communication

- [Send OSC](/docs/nodes/send-osc): Send OSC messages, including detected landmarks, to other applications.
- [Receive Rokoko](/docs/nodes/receive-rokoko): Receive live motion capture from Rokoko Studio.
- [Share Image](/docs/nodes/share-image): Share the image with other applications via Syphon (macOS).
