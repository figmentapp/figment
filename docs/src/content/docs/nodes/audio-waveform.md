---
title: 'Audio Waveform'
---

# Audio Waveform

Play an audio file and draw its waveform as a line. The output image is 512 by 256 pixels: a white line on black that follows the audio signal over the last few milliseconds.

## Parameters

- **File** The audio file to play. Figment stores a [relative path](/docs/structuring#relative-paths) when the project is saved.
- **Play** Start and stop playback. The file loops.

## Outputs

- **Out** The waveform.
