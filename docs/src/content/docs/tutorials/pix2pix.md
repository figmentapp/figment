---
title: 'Using Figment with PIX2PIX'
---

# Using Figment with PIX2PIX

Figment is an amazing tool for preparing data for machine learning models. We love [PIX2PIX](https://phillipi.github.io/pix2pix/) because it gives control and it can learn a lot from input data.

The best input data is _structurally similar_ to the input data, that is, there is a one-to-one relationship from the input to the output data. Here are some examples:

<figure><img src="/img/tutorials/pix2pix/deoldify.jpg" alt="Deoldify by Jason Antic"/><figcaption>Deoldify by Jason Antic</figcaption></figure>

<figure><img src="/img/tutorials/pix2pix/fill-in-the-blanks.jpg" alt="Fill in the blanks"/><figcaption>"Fill in the blanks" — let the AI invent parts of the image by removing them</figcaption></figure>

<figure><img src="/img/tutorials/pix2pix/cats.jpg" alt="Drawings to cats"/><figcaption>Drawings to cats — create a photorealistic cat from a drawing</figcaption></figure>

The _trick_ to making the training data is doing the _opposite_ transformation of what we're trying to acquire. So, as an example, to convert black and white image to color images, we're using existing color images and _removing_ the color information, then letting PIX2PIX learn the color mapping.

## Video Tutorial

The video shows the complete workflow. Its training section uses an older, cloud-based setup; the text below describes the current one.

<div class="video-wrapper">
  <iframe  src="https://www.youtube-nocookie.com/embed/CbB7kAb0UDM" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

## What we'll make

We're making a face generator that's built on artificial faces, using [This Person Does Not Exist](https://thispersondoesnotexist.com). In a way, we're creating a second-generation AI, based on existing AI.

This idea was actually developed by [Alexandra Fraser](https://www.alexandrafraser.eu) in her project [Maureen](https://algorithmicgaze.com/projects/maureen/).

![Maureen by Alexandra Fraser](/img/tutorials/pix2pix/maureen.jpg)

## Acquiring the data

We have a folder of data prepared that you can download. These are 5,000 images downloaded from the _This Person Does Not Exist_ website. Download the ZIP file here: [does-not-exist.zip](https://figmentapp.s3.amazonaws.com/datasets/does-not-exist.zip)

However, we can also do this using a [Fetch Image node](/docs/nodes/fetch-image). In the case of this website, we can fetch the same URL repeatedly and get a different image every time:

- Create a **Fetch Image** Node. Set the url to `https://thispersondoesnotexist.com/`, the "refresh" on and the refresh time to 1 second.
- Create a **Save Image** Node. Choose the folder.
- Select File > Render and render out as much images as you want. Set the framerate to 1 (same as the refresh time).

<figure><img src="/img/tutorials/pix2pix/fetch-image.png" alt="Screenshot of Fetch Image setup"/><figcaption>Screenshot of Fetch Image setup</figcaption></figure>

## Setting up Figment

Create a new project folder, e.g. on your desktop. Open Figment and immediately save the file in the project folder.

Put your images folder in the project folder as well.

In your new project, delete all nodes. We're going to start from scratch.

Create a [Load Image Folder node](/docs/nodes/load-image-folder), click the "Choose" button next to the folder, and select the images folder. The images should now be "animating":

<video autoplay muted loop src="/img/tutorials/pix2pix/load-image-folder.mp4" style="width: 100%;"></video>

<br/>
<br/>

:::tip

You could also use the [webcam node](/docs/nodes/webcam-image) to generate an artificial, creepy version of yourself!

:::

The PIX2PIX algorithm requires the input to be square. We're going to be using `512x512` images, so we'll use [Resize node](/docs/nodes/resize) to mold them into shape.

- Create a `Resize` node.
- Set the width and height both to `512`.
- Set the fit mode to `cover`.
- Connect the output of the `Load Image Folder` node to the input of the `Resize` node.

Since these are faces, we want to use a face detection algorithm. The [Detect Faces node](/docs/nodes/detect-faces) works well here. It uses Google's MediaPipe face landmark model to find 478 points on each face. Set it up to draw the face mesh:

- Create a `Detect Faces` node.
- Set _Draw Mode_ to `tesselation`.
- Set _Mode_ to `still`. The images in the folder are unrelated, so the node has to run the detector on every one of them.
- Connect the output of `Resize` to the input of `Detect Faces`.

<figure><img src="/img/tutorials/pix2pix/detect-faces.png" alt="Screenshot of Detect Faces setup"/><figcaption>Screenshot of Detect Faces setup</figcaption></figure>

If your photos show whole bodies instead of faces, use the [Detect Pose node](/docs/nodes/detect-pose) in place of Detect Faces and set its _Coloring_ to `per limb`. Every limb then has its own color, so the model can tell which line is which and which side of the body faces the camera.

The training script requires the two images side-by-side, with the **target** (the photo) on the left and the **input** (the mesh) on the right. We'll do that with a [Stack node](/docs/nodes/stack). Note that our final size should be `1024x512`, so we'll take the output of `Resize` and `Detect Faces`, which are both `512x512`.

- Create a `Stack` node.
- Connect the output of `Resize` to the first input of `Stack`.
- Connect the output of `Detect Faces` to the second input of `Stack`.

The finishing touch:

- Create a "Save Image" node.
- Set the folder to save to.
- In template, use `image-#####.jpg` to save the images with a number.
- Connect the output of `Stack` to the `Save Image` node.

We're ready to export. We'll export 5000 frames (as many as we have input images) to an "input" folder.

:::info

Why is the exported folder called "input"? It's because it's the **input** for the next step, which is the PIX2PIX machine learning algorithm.

:::

<figure><img src="/img/tutorials/pix2pix/prepare.png" alt="Figment Prepare Project Setup"/><figcaption>Screenshot of Figment with the prepared pipeline</figcaption></figure>

## Training the model

Figment runs the trained model through the [ONNX Image Model](/docs/nodes/onnx-image-model) node. That page contains a complete PyTorch training script. Save it as `train.py` next to your `input` folder.

The script reads every side-by-side image, splits it in the middle, and learns to turn the right half (the mesh) into the left half (the photo). After every epoch it writes an ONNX file that Figment can load directly.

Training needs a GPU. On a machine with an NVIDIA card:

```bash
pip install torch==2.4.0 torchvision==0.19.0 onnx==1.16.1 onnxruntime==1.19.0
python train.py --input_dir input --output_dir output
```

On a CPU the script works but is far too slow to be practical. If you do not have a GPU, upload the `input` folder and `train.py` to a cloud notebook with a GPU, such as Google Colab, and run the same two commands there.

While training runs, the `output` folder fills up with:

- `epoch_N_iter_M.jpg`: a sample with the input, the model's output, and the target side by side. Early samples are noise; after a few epochs faces appear.
- `generator_epoch_N.onnx`: the model after epoch N. This is the file Figment loads.
- `snapshot_epoch_N.pth`: a checkpoint. If you stop the script, running it again continues from the last snapshot.

Stop the script when the samples look good enough, and take the most recent `.onnx` file. A few hours on a modern GPU gives usable faces; a few days gives good ones.

## Building the real-time script in Figment

The Figment real-time script is very similar to the generation script. Only you will now use the webcam as the input.

- Create a Webcam Image node.
- Create a Resize node and connect it to the output of the Webcam Image node. Make sure it's set to 512x512, the size the model was trained on.
- Create a Detect Faces node and connect it to the output of the Resize node. Set _Draw Mode_ to `tesselation`, as you did in the other example. Leave _Mode_ on `video` this time, so the node tracks your face from frame to frame.
- Create an ONNX Image Model node. Connect it to the output of the Detect Faces node. For the model, choose the `.onnx` file you trained.

You should now see your own face being recreated with virtual faces from This Person Does Not Exist.

Here's an example with a model that's trained for a number of days:

<figure>
<video loop="true" autoplay="true" muted="true" src="https://tag-site.s3-eu-central-1.amazonaws.com/maureen/maureen-2.mp4" width="100%"/>
<figcaption>Maureen and a realtime face, side-by-side.</figcaption>
</figure>

## Driving the model with a different body

A model trained on one performer only ever saw that body at one size on screen, with the feet on one line. When someone else drives it, they are taller or shorter and stand closer or further away, so their skeleton lands where the model has never seen one. The [Normalize Pose](/docs/nodes/normalize-pose) node fixes this: it zooms the guest's skeleton until it is as tall as the performer's and puts the feet on the performer's floor, without changing the guest's proportions.

The live graph is:

`Webcam Image` → `Detect Pose` → `Normalize Pose` → `ONNX Image Model`

Connect the **landmarks** output of Detect Pose to Normalize Pose, and the **out** image of Normalize Pose to the model. Normalize Pose draws the normalized skeleton with the same parameters as Detect Pose: set its _Width_ and _Height_ to the size the model was trained on, and its _Coloring_ and colors to what you used when you made the dataset.

Normalize Pose needs three numbers about the performer: the floor (the ankle line), the height (ankles to nose) and the x position of the hips. All of them are fractions of the image, 0 to 1, from the top left corner, so they do not depend on the resolution. Measure them in Figment with a separate, throwaway graph on the performer footage:

`Load Movie` → `Detect Pose` → `Normalize Pose`

Let it run for a few seconds and read the **measured floor**, **measured height** and **measured x** outputs of the Normalize Pose node. Type them into _Reference Floor_, _Reference Height_ and _Reference X_ of the Normalize Pose node in the live graph.

The graph that makes the dataset must not contain a Normalize Pose node. The performer has to be saved exactly where the camera saw them; the normalizing happens only on the guest, at show time.

For a face model, the same works with `Detect Faces` → [Normalize Face](/docs/nodes/normalize-face) → `ONNX Image Model`.
