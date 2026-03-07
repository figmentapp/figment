# Figment node-based creative AI application

Figment is a visual node-based application for creative AI data processing, built with Electron, React, Zustand and WebGPU.

## Dev (usable by Claude)

- `npm install` - Install dependencies
- `npm run format` - Format code with Prettier
- `npm run build` - Build production bundle
- `npm run fastdist` - Build unsigned app for macOS for testing

## Other Development Commands (not usable by Claude)

- `npm start` - Start Electron app in development mode
- `npm run dist` - Build, package and sign apps for macOS and Windows
- `npm run dist-mac` - Build, package and sign for macOS only
- `npm run dist-win` - Build, package and sign for Windows only

### Core Components

- `src/model/`: core application logic and data structures
- `src/nodes/`: node definitions and processing logic
- `src/ui/`: React components and UI logic
- `src/ui/store.js`: Zustand state management
- `src/electron/`: Electron main and preload scripts
- `src/figment.js`: graphics pipeline and shader management
- `src/file-format.js`: handling different project file format versions
- `docs/`: documentation site (Astro)

### UI Architecture

React-based interface (`src/ui/`) using functional components and Zustand for state management:

- **App.jsx**: Main application state and file management
- **Editor.jsx**: Node graph visual editor with drag-and-drop
- **Viewer.jsx**: Real-time output display
- **ParamsEditor.jsx**: Node parameter controls
- State is managed globally using Zustand stores for reactive updates

### Development Notes

- Make sure code is formatted correctly with `npm run format` and tested with `npm test` before committing/handoff to user.
