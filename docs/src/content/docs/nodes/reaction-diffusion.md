---
title: 'Reaction Diffusion'
---

# Reaction Diffusion

Run a Gray-Scott reaction-diffusion simulation that grows organic patterns, such as spots, stripes, and coral shapes. The input image is fed into the simulation every frame, so bright areas of the input seed and steer the pattern.

The output is not a picture of the input: the red channel holds the concentration of chemical A and the green channel that of chemical B. Put a [Threshold](/docs/nodes/threshold), [Levels](/docs/nodes/levels), or [Lookup](/docs/nodes/lookup) node after it to turn the concentrations into an image.

Patterns take hundreds of frames to form. Small changes to the feed and kill rates give very different results; the defaults produce spots.

## Parameters

- **Influence** How strongly the input image is added to the simulation each frame, from 0 to 1.
- **Delta Time** The size of one simulation step. Larger values run faster but can become unstable.
- **Feed Rate** The rate at which chemical A is added, from 0 to 0.1.
- **Kill Rate** The rate at which chemical B is removed, from 0 to 0.1.
- **Diffusion A** and **Diffusion B** How fast each chemical spreads, from 0 to 1.
- **Iterations** The number of simulation steps per frame, from 1 to 50. More steps give a faster evolution at the same frame rate.
- **Reset** Clear the simulation and start again.

## Outputs

- **Out** The simulation state, with chemical A in red and chemical B in green.
