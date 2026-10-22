---
title: 'Receive Rokoko'
---

# Receive Rokoko

Receive live motion capture from [Rokoko Studio](https://www.rokoko.com/products/studio) and draw the skeleton. With the `pose` skeleton the node maps the Rokoko joints onto the 33 landmarks of [Detect Pose](/docs/nodes/detect-pose) and draws them with the same code, so an image-to-image model trained on Detect Pose drawings sees the same picture from motion capture. The landmarks output then has the shape of Detect Pose's, so [Send OSC](/docs/nodes/send-osc), [Normalize Pose](/docs/nodes/normalize-pose) and [Draw Landmarks](/docs/nodes/draw-landmarks) work without changes.

The Smartsuit does not track the face, the fingertips or the heels. The node places the eyes, ears, nose and mouth at an adult head's proportions above the head joint, facing the direction the shoulders face; the heels behind the ankles; and the hand points along the forearm past the wrist. With Smartgloves the hand points come from the glove's knuckles. A turned head does not move the face points: the mapping follows the shoulders, not the head rotation.

## Setup in Rokoko Studio

- In Rokoko Studio, enable the **JSON** livestream.
- Set the address to the computer that runs Figment and the port to the UDP port on the node. The default is 14043.
- Rokoko Studio compresses the stream with LZ4; the node decompresses it. Nothing else is needed on the Figment side.

## Parameters

- **Skeleton** `pose` draws the Detect Pose skeleton: 33 landmarks, same order and same connections. `rokoko` draws the joints as Rokoko Studio sends them, connected along the Rokoko bones.
- **Background** The color that fills the output image behind the drawing.
- **Coloring** `solid` draws every point and line in the colors below. `per limb` gives each landmark and each limb the fixed color Detect Pose uses, for the `pose` skeleton; the `rokoko` skeleton has no palette and draws solid.
- **Draw Points** and its **Color** and **Radius** Draw each joint as a dot.
- **Draw Lines** and its **Color** and **Line Width** Connect the joints with lines.
- **Width** and **Height** The size of the output image in pixels.
- **Camera X**, **Camera Y**, **Camera Z** The position of the virtual camera that looks at the actor, in meters. The actor stands at the origin; the default camera is one meter up and three meters back.
- **Field of View** The lens angle of the virtual camera, in degrees.
- **Treadmill** Keep the actor centered in the frame by subtracting the hip position. Turn it on when the actor walks around the room.
- **UDP Port** The port Rokoko Studio streams to.

## Outputs

- **Out** The drawing.
- **Detected** `true` while a body is being received.
- **Landmarks** With the `pose` skeleton, an object with `type: 'pose'` and a `landmarks` array with one entry, the actor, as Detect Pose outputs it. With the `rokoko` skeleton, an object with `type: 'rokoko'` and the `body` from the Rokoko stream, with the position and rotation of every joint. `null` while no body is received.
