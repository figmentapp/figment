---
title: 'Smooth'
---

# Smooth

Blend each frame with the frames before it. The node keeps a running image on the GPU and mixes every new input frame into it. Use it to calm a noisy webcam, to soften the flicker of a detection node, or to build motion blur and light trails.

The first frame after a start or a clear passes through as-is, so the output does not fade up from black.

## Parameters

- **Amount** How much of the previous frames survives, from 0 to 1. At `0` the input passes through unchanged. At `1` the running image freezes. The response is cubic, so most of the useful range sits near the top: `0.7` is a light smoothing, `0.95` is a long trail.
- **Mode** How the new frame combines with the running image. `average` is a plain crossfade. `max` keeps the brightest value of each pixel, so bright objects leave trails on a dark background. `min` keeps the darkest value, so dark objects leave trails on a light background. Alpha always uses the average.
- **Clear** Drop the running image and start again from the next input frame.

## Outputs

- **Out** The smoothed image, at the size of the input image.
