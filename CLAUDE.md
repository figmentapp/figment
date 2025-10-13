# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands (usable by Claude)

- `npm install` - Install dependencies
- `npm run format` - Format code with Prettier
- `npm run build` - Build production bundle
- `npm run build-library` - Build the standalone library (Rollup for figment-player.js)
- `npm run fastdist` - Build unsigned app for macOS for testing

## Other Development Commands (not usable by Claude)

- `npm start` - Start Electron app in development mode
- `npm run dist` - Build, package and sign apps for macOS and Windows
- `npm run dist-mac` - Build, package and sign for macOS only
- `npm run dist-win` - Build, package and sign for Windows only

## Architecture Overview

Figment is a visual node-based application for creative AI data processing, built with Electron, React, and WebGL.

### Core Components

- **Network** (`src/model/Network.js`): Central orchestrator that manages nodes, connections, and rendering pipeline
- **Node** (`src/model/Node.js`): Individual processing units with input/output ports and lifecycle methods (onStart, onRender, onStop)
- **Library** (`src/model/Library.js`): Dynamic loader for node types from `src/nodes/` directory using JSDoc metadata
- **Port** (`src/model/Port.js`): Typed connection points supporting images, numbers, strings, colors, files, etc.
- **DependencyGraph** (`src/model/DependencyGraph.js`): Manages execution order and dirty propagation

### Node System

Nodes are dynamically loaded from `src/nodes/`. Node types include:

- **Image processing**: `src/nodes/image/` - WebGL shader-based effects and transformations
- **Machine learning**: `src/nodes/ml/` - MediaPipe, TensorFlow.js, and ONNX models for pose detection, face detection, etc.
- **Core**: `src/nodes/core/` - Output nodes and utilities
- **Communications**: `src/nodes/comms/` - Communication nodes for OSC messaging, etc.

Node structure example:

```javascript
/**
 * @name Node Name
 * @description Description text
 * @category category
 */

const inputPort = node.imageIn('in');
const outputPort = node.imageOut('out');

node.onStart = async () => {
  /* initialization */
};
node.onRender = () => {
  /* processing logic */
};
node.onStop = () => {
  /* cleanup, optional */
};
```

### Graphics Pipeline

- Uses WebGL through TWGL.js for GPU-accelerated image processing
- Custom shader system in `src/figment.js` with framebuffer management
- All image operations use fragment shaders with quad rendering

### File Format

Projects use `.fgmt` extension with JSON serialization including:

- Poject format version number
- Node definitions with positions and parameter values
- Connection mapping between ports
- Project settings (OSC configuration, etc.)

Version upgrades happen in `src/file-format.js`.

### UI Architecture

React-based interface (`src/ui/`) using functional components and Zustand for state management:

- **App.jsx**: Main application state and file management
- **Editor.jsx**: Node graph visual editor with drag-and-drop
- **Viewer.jsx**: Real-time output display
- **ParamsEditor.jsx**: Node parameter controls
- State is managed globally using Zustand stores for reactive updates

### Development Notes

- Nodes support expressions using JEXL with context variables: `$FRAME`, `$TIME`, `$NOW`
- MediaPipe models stored in `assets/mediapipe/`
- Electron main process `src/electron/main.js` handles file I/O and OSC communication
- `src/electron/preload.mjs` handles IPC communication
- Hot reloading supported for node development
- All shaders use `precision mediump float` for compatibility
- Make sure code is formatted correctly with `npm run format`
