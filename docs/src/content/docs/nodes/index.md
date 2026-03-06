---
title: "Figment Nodes"
---

# Figment Nodes

This is a list of all the nodes in Figment:

## Core

- [Null](/docs/nodes/null): Does nothing.
- [Out](/docs/nodes/out): Signifies that this is the output of the network.

## Image Operations

### Creating / Loading Images

- [Constant](/docs/nodes/constant): Render a constant color.
- [Fetch Image](/docs/nodes/fetch-image): Fetch an image from the internet.
- [Load Image](/docs/nodes/load-image): Load an image from a file.
- [Load Image Folder](/docs/nodes/load-image-folder): Load a folder of images.
- [Load Movie](/docs/nodes/load-movie): Load a movie file.
- [Unsplash](/docs/nodes/unsplash): Fetch a random image from Unsplash.
- [Webcam Image](/docs/nodes/webcam-image): Return a webcam stream.

### Resizing / Cropping / Combining images

- [Resize](/docs/nodes/resize): Resize the input image.
- [Crop](/docs/nodes/crop): Crop an input image.
- [Composite](/docs/nodes/composite): Combine two images together.
- [Stack](/docs/nodes/stack): Combine 2 images horizontally / vertically.

### Filters / Effects

The images of the examples courtesy of [John Mark Arnold](https://unsplash.com/@johnmarkarnold) and [Sergey Shmidt](https://unsplash.com/@monstercritic).

- [Blur](/docs/nodes/blur): Blur an input image.
- [Border](/docs/nodes/border): Generate a border around the image.
- [Canny](/docs/nodes/canny): Canny edge detection on input image.
- [Mask Ellipse](/docs/nodes/mask-ellipse): Draw a circular mask of an image or color.
- [Emboss](/docs/nodes/emboss): Emboss convolution on an input image.
- [Grayscale](/docs/nodes/grayscale): Convert the input image to grayscale.
- [Invert](/docs/nodes/invert): Invert the colors of input image.
- [Lens Distortion](/docs/nodes/lens-distortion): Distort an image using a lens distortion shader.
- [Levels](/docs/nodes/levels): Change the brightness/contrast/saturation of an image.
- [Lookup](/docs/nodes/lookup): Map the colors of one image to another image.
- [Mirror](/docs/nodes/mirror): Mirror the input image over a specific axis.
- [Modulate Color](/docs/nodes/modulate-color): Adjust the colors of the input image.
- [Pixelate](/docs/nodes/pixelate): Pixelate the input image.
- [Reduce Color](/docs/nodes/reduce-color): Reduce the amount of colors of input image.
- [Sharpen](/docs/nodes/sharpen): Sharpen an input image
- [Sobel](/docs/nodes/sobel): Sobel edge detection on input image.
- [Squares](/docs/nodes/squares): Return input image as squares.
- [Threshold](/docs/nodes/threshold): Change brightness threshold of input image.
- [Trail](/docs/nodes/trail): Don't erase the previous input image, creating a trail.
- [Transform](/docs/nodes/transform): Transform the image.

### Machine Learning

- [Detect Objects](/docs/nodes/detect-objects): Detect objects in an image and draws labels around them.
- [Detect Faces](/docs/nodes/detect-faces): Detect faces in an image.
- [Detect Pose](/docs/nodes/detect-pose): Detect human poses in input image.
- [Segment Pose](/docs/nodes/segment-pose): Remove the background from an image.
- [Detect Hands](/docs/nodes/detect-hands): Detect hands in an input image.
- [Image to Image](/docs/nodes/image-to-image): Run a generative image to image model (pix2pix).
