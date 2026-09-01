---
title: 'Exporting'
---

# Exporting

Use `File > Export` to export a sequence of images to disk. The export dialog will save all [Save image](/docs/nodes/save-image) nodes, so make sure you have those in your network.

:::tip
Exporting will not work if you don't have any **Save Image** nodes in your network.
:::

## Frame rate

Because input nodes can have different settings, we set a _frame rate_ to give an indication of the speed at which to export. As an example, exporting 60 frames at a frame rate of 30fps would export a 2 second sequence. The frame rate is important for real-time nodes like webcam, because it will try to capture that many frames per second, if it can.

## Options

Export takes a number of options:

- **Node** The node to export. Defaults to the Out node.
- **Frames** The amount of frames to export.
- **Frame rate** The frame rate to export, e.g. exporting 60 frames at a frame rate of 30fps would export a 2 second sequence.
- **Folder** The folder to export to
- **Prefix** The file prefix. Files will have this prefix and then a number, e.g. a prefix of `hands` will have files called `hands-0001.png` etc.
- **Image Format** Choose between PNG and JPEG here. PNGs are lossless, JPEGs are smaller but with a reduced quality. For machine learning we often use JPEGs with a quality setting of 90.

## Command line

Figment can render a project without opening the editor, for batch jobs and scripts. Point the app binary at a project with `--render`:

```sh
# macOS
/Applications/Figment.app/Contents/MacOS/Figment --render ~/Desktop/test.fgmt --frames 150 -o frames/test-####.png
```

The project must have an **Out** node. Any **Save Image** nodes write their frames as they do with `File > Render`. Pass `--output` to write the Out node's image as well, or when the project has no Save Image node.

| Option                      | Meaning                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `-o`, `--output <template>` | File to write the Out node image to. `#` characters are replaced by the zero-padded frame number. The extension picks PNG or JPEG. |
| `--frames <n>`              | Number of frames to render. Defaults to the frame count of the longest Load Movie, or 1 for a still.                               |
| `--fps <n>`                 | Export frame rate. Defaults to the movie's frame rate, or 60.                                                                      |
| `--quality <0..1>`          | JPEG quality for `--output`. Default 0.9.                                                                                          |
| `--help`                    | Show the options.                                                                                                                  |

Relative paths resolve against the current directory. The exit code is 0 when every frame was written, 1 when the render failed, and 2 for bad arguments or a missing project file. Node errors are printed to stderr and stop the render.
