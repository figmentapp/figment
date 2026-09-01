---
title: 'Audio Spectrum'
---

# Audio Spectrum

Play an audio file and draw its frequency spectrum as a bar graph. The node also makes the band values available to expressions, so any parameter in the network can move with the music.

The output image is 512 by 256 pixels: white bars on black, one bar per band, from low frequencies on the left to high on the right. The bars are smoothed over time.

## Parameters

- **File** The audio file to play. Figment stores a [relative path](/docs/structuring#relative-paths) when the project is saved.
- **Play** Start and stop playback. The file loops.
- **Bands** The number of frequency bands, from 4 to 128.
- **Spacing** `log` divides the spectrum the way the ear hears it, with more bands for the low frequencies. `linear` gives every band the same width in hertz.

## Outputs

- **Out** The bar graph.

## In expressions

- `band(i)` returns the level of band `i`, from 0 to 1. For example, bind the radius of a [Vignette](/docs/nodes/vignette) to `0.3 + band(0) * 0.5` to pulse with the bass.
- `bands()` returns all levels as an array.

See [Expressions](/docs/expressions) for the full syntax.
