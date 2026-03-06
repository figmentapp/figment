---
title: "Trail"
---

# Trail

This node does not erase the previous input image, creating a trailing effect by accumulating frames over time.

## Parameters

- **In** The input image to accumulate.
- **Fade** Controls how quickly the trail fades away using Monte Carlo sampling. Each pixel has a probability of being cleared based on this value. Range: 0.0 to 1.0. A value of `0` means no fading (infinite trail), while higher values fade faster. Uses a power curve so low values produce very slow, subtle fades.
- **Clear** Button to clear the accumulated trail.

## Outputs

- **Out** The accumulated trail image.

## Example

<img src="/img/nodes/trail.jpg" alt="Figment trail node example"/>
