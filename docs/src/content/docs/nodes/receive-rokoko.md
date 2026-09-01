---
title: 'Receive Rokoko'
---

# Receive Rokoko

Receive live motion capture from [Rokoko Studio](https://www.rokoko.com/products/studio) and draw the skeleton, in the same style as [Detect Pose](/docs/nodes/detect-pose). The landmarks output has the same shape as the detection nodes, so the [Send OSC](/docs/nodes/send-osc) node and any other consumer of landmarks work without changes.

## Setup in Rokoko Studio

- In Rokoko Studio, enable the **JSON** livestream.
- Set the address to the computer that runs Figment and the port to the UDP port on the node. The default is 14043.
- Rokoko Studio compresses the stream with LZ4; the node decompresses it. Nothing else is needed on the Figment side.

## Parameters

- **Background** The color that fills the output image behind the drawing.
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
- **Landmarks** An object with `type: 'rokoko'` and the `body` from the Rokoko stream, with the position and rotation of every joint.
