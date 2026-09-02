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
- `src/onnx/`: ONNX model converter (float16, ConvTranspose rewrite) and its protobuf codec
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

### Pre-handoff & post-ship verification

Local checks before handoff (in order):

1. `npm run format` — Prettier writes any changes.
2. `npm test` — must be all-green.
3. `npm run build` — production build must succeed.

After pushing a PR, do not declare "shipped" until CI is checked:

1. Wait ~30s, then run `gh pr checks <PR#>` (or `gh pr view <PR#> --json statusCheckRollup`).
2. If any required check failed, fetch the log with `gh run view <runId> --log-failed` and surface the failure to the user *with the relevant snippet* — do not just say "CI failed."
3. Distinguish PR-caused failures from CI-infra failures (e.g. node/npm upgrade steps, dependabot, Netlify quota). For infra failures, name the failing step and note that recent PRs hit the same thing — don't try to silently patch the workflow unless asked.
