---
title: 'Normalize Pose'
---

# Normalize Pose

Scale and move the landmarks from [Detect Pose](/docs/nodes/detect-pose) so the person on screen has the size and position of the body a pose-to-image model was trained on. A model that has only ever seen one performer, at one size, with the feet on one line, can then be driven by a guest who is taller or shorter and stands closer or further away. This is the global pose normalization step of _Everybody Dance Now_ (Chan et al. 2019).

The node measures two things on each person: the **anchor** (the hips left to right, the ankle line up and down) and the **height** (from the ankle line to the nose). It zooms the whole skeleton about the anchor until the height matches the reference height, then slides the anchor onto the reference floor. The zoom is uniform, never a stretch, so the guest keeps their own proportions. Rotation is left alone: a head roll or a body lean is part of the performance.

All values are in landmark units: fractions of the image, 0 to 1, with the origin top left and y down. They are independent of the resolution, so a reference floor of `0.9` is the same line in a 512 px training image and a 1080p live frame.

The node draws the result with the same parameters and the same code as Detect Pose, so the **Out** image goes straight into the [ONNX Image Model](/docs/nodes/onnx-image-model) node and shows the model the picture it was trained on. See the [pix2pix tutorial](/docs/tutorials/pix2pix#driving-the-model-with-a-different-body) for the full graph.

## Finding the reference values

The training images are drawings, not landmarks, so measure the performer in Figment with the same detector that made them: `Load Movie` (or `Load Image Folder` with the extracted frames) → `Detect Pose` → `Normalize Pose`. After a few seconds, read the **measured floor**, **measured height** and **measured x** outputs and type them into the reference parameters of the Normalize Pose node in the live graph. This measurement graph is a separate, throwaway graph: the graph that makes the dataset must not contain a Normalize Pose node, because the performer must be saved exactly where the camera saw them.

## Parameters

- **Reference Floor** Where the performer's ankle line was in the training frames.
- **Reference Height** The performer's ankle-to-nose height in the training frames.
- **Reference X** Where the performer's hips land, left to right, in `follow` and `treadmill` mode.
- **Horizontal** What happens sideways. `keep` only zooms: where the guest stands left to right shows as it is. `follow` moves the guest's usual position over the window onto the reference x, so steps and sways still show but a slow drift across the stage is removed. `treadmill` puts the hips on the reference x on every frame, so all sideways travel is removed: the legs still step, the body stays put.
- **Measure** How the node measures the guest. `continuous` averages over the last **Window** seconds and keeps following the guest. `on reset` measures during the first **Window** seconds after **Measure Again** is pressed and then freezes, so the guest stands still for a moment and is then free to move. `manual` uses the driver values below instead of measuring.
- **Window** The measuring time in seconds. A short window follows a guest who walks toward the camera; a long window keeps jumps and crouches, because the floor is the lowest the feet get over the window and the height is the median. With `3` seconds or more, a jump stays a jump.
- **Measure Again** Starts the measurement over, for every person. Changing **Measure** or **Window** does the same, and so does the start of an export.
- **Driver Floor**, **Driver Height**, **Driver X** The guest's measurements, used only in `manual` mode.
- **Width**, **Height** The size of the output image. Use the size the model was trained on.
- **Background**, **Coloring**, **Draw Points**, **Draw Lines** and their colors and sizes: the drawing parameters of [Detect Pose](/docs/nodes/detect-pose). Set them to what you used when you made the dataset.

## Outputs

- **Out** The drawing of the transformed landmarks.
- **Landmarks** The same object as the input, with every person transformed. Objects of another type pass through unchanged and the node shows an error.
- **Measured Floor**, **Measured Height**, **Measured X** The current estimate for the first person. Fed with the performer footage, these are the numbers to type into the reference parameters.

The node keeps one estimate per person. A person who is gone for longer than the window is measured afresh when they come back.
