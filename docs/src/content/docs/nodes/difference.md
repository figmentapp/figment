---
title: 'Difference'
---

# Difference

Show what changed between this frame and the previous one. Pixels that stayed the same turn black; pixels that moved light up. Use it with a [Webcam Image](/docs/nodes/webcam-image) or [Load Movie](/docs/nodes/load-movie) as a simple motion detector, or feed the result to a [Threshold](/docs/nodes/threshold) node to get a hard mask of the moving parts.

A still image gives a black output, because nothing changes from frame to frame.

## Parameters

- **Amplify** Multiplies the difference, from 0 to 100. Raise it to make small movements visible.

## Outputs

- **Out** The absolute difference between the current and the previous frame.
