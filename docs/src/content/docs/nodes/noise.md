---
title: 'Noise'
---

# Noise

Mix random grain into the image. The noise is fixed for a given seed, so a still image stays still. To make it flicker like film grain, bind the seed to an expression such as `$FRAME`.

## Parameters

- **Noise Factor** The brightness of the grain, from 0 to 10.
- **Seed** The random seed. Every value gives a different grain pattern.

## Example

<img src="/img/nodes/noise.jpg" alt="Figment noise node example"/>
