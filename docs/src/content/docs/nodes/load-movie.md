---
title: "Load Movie"
---

# Load Movie

This node plays a movie from disk.

## Parameters

- **File** The file that needs to be played. Figment will use [relative paths](/docs/structuring#relative-paths) if the file was saved.
- **Quality** Choose between `fast` (uses native video element) or `accurate` (frame-perfect playback using [MediaBunny](https://mediabunny.dev/)). Default is `fast`.
- **Play** Play the video. Turn this off to pause playback.
- **Loop** Loop the video when it reaches the end. Default is on.
- **Pause Mode** Determines behavior when pausing:
  - `hold` - Keep the current frame (default)
  - `restart` - Jump to the first frame when resuming
  - `rewind` - Jump to the first frame immediately when pausing
- **Speed** The playback speed of the video. A speed of `1` means the original rate, `0.5` is half speed, `2` is double speed, and so on. Range: 0.0 to 10.
- **Restart** Button to restart the movie from the beginning.
- **Frame** Manually select which frame to display (1-based). Only works when playback is paused.

## Outputs

- **Out** The current video frame as an image.
- **Frame Count** The total number of frames in the video.
- **Current Frame** The current frame number (1-based).
- **FPS** The detected frame rate of the video.
- **Duration** The duration of the video in seconds.
