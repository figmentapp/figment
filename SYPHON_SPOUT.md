# Syphon/Spout Support

Figment now supports sharing video frames with other applications through Syphon (macOS) and Spout (Windows) via Inter-Process Communication (IPC).

## Overview

Syphon and Spout are frameworks for sharing video frames between applications in real-time:
- [Syphon](https://syphon.github.io/) - macOS framework for sharing frames between applications
- [Spout](https://spout.zeal.co/) - Windows framework for sharing frames between applications

This allows you to send frames from Figment to other creative applications like Max, MadMapper, Resolume, TouchDesigner, and many others.

## Implementation

The implementation uses Electron's offscreen rendering capabilities with shared textures, introduced in Electron 29+. This feature allows access to hardware textures directly, enabling efficient frame sharing.

### Architecture

1. **Node**: `Send Syphon/Spout` node in the `comms` category accepts an image input
2. **Main Process**: Handles shared texture access through the `paint` event with `offscreen: { useSharedTexture: true }`
3. **IPC Bridge**: Preload script exposes methods for communication between renderer and main process
4. **Frame Sharing**: Frames are read from WebGL framebuffers and sent to the main process

## Usage

1. Add a `Send Syphon/Spout` node to your network
2. Connect an image source to the node's input
3. Configure the node:
   - **Enable**: Toggle frame sharing on/off
   - **Server Name**: Name of your Syphon/Spout server (default: "Figment")
   - **FPS**: Frame rate for sending frames (1-120 fps)
4. Run your network - frames will be shared with other applications

## Current Status

### Implemented
- ✅ Node infrastructure for frame capture
- ✅ IPC communication between renderer and main process
- ✅ Offscreen rendering with shared textures enabled
- ✅ Paint event listener for shared texture access
- ✅ Frame data extraction from WebGL framebuffers

### Future Work

The current implementation provides the foundation for Syphon/Spout support but requires native integration to complete:

1. **Native Modules**: Native Node.js modules need to be created or integrated:
   - For macOS: Syphon framework integration
   - For Windows: Spout SDK integration

2. **Texture Handle Sharing**: The `textureInfo.texture` native handle from Electron's paint event needs to be passed to native Syphon/Spout code for direct GPU texture sharing.

3. **Fallback Mode**: The current CPU-based fallback (reading pixels via `gl.readPixels`) works but is less efficient than GPU texture sharing.

## Technical Details

### Electron Configuration

The main window is configured with offscreen rendering:

```javascript
webPreferences: {
  offscreen: {
    useSharedTexture: true,
  },
}
```

### Paint Event

The paint event provides access to shared textures:

```javascript
browserWindow.webContents.on('paint', async (event, dirty, image) => {
  if (event.texture) {
    const textureInfo = event.texture.textureInfo;
    // textureInfo.texture contains the native texture handle
    // This can be imported into Syphon/Spout for GPU sharing
    event.texture.release();
  }
});
```

### Node Implementation

The node reads pixels from WebGL framebuffers:

```javascript
const imageData = new Uint8Array(width * height * 4);
framebuffer.bind();
gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
framebuffer.unbind();
```

## Resources

- [Electron Offscreen Rendering](https://github.com/electron/electron/blob/main/shell/browser/osr/README.md)
- [Electron WebContents Paint Event](https://github.com/electron/electron/blob/main/docs/api/web-contents.md#event-paint)
- [Syphon Framework](https://syphon.github.io/)
- [Spout SDK](https://spout.zeal.co/)

## Contributing

To complete the native integration:

1. Add native module dependencies for Syphon/Spout
2. Implement texture handle import in native code
3. Update `src/electron/syphonSpout.js` to use native modules
4. Test with Syphon/Spout receiver applications

Contributions are welcome! Please see the main [CONTRIBUTING.md](CONTRIBUTING.md) guide.
