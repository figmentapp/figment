# figment-frameshare

Native Node addon (Rust + napi) that publishes Figment's rendered frames to
other applications. On macOS it is a Syphon server; a Spout backend for
Windows is planned. On other platforms the addon reports unavailable and the
Share Image node degrades gracefully.

## How it works

- The **Share Image** node (`src/nodes/comms/shareImage.js`) reads the
  frame back from the GPU (`RenderTarget.readPixelsRaw()`) and hands the RGBA
  buffer to the preload bridge (`window.desktop.frameSharePublish`).
- The preload script loads this addon **in-process** (`index.js` picks the
  right prebuilt `.node`), so publishing never crosses to the Electron main
  process — no IPC, one buffer handoff.
- The Rust crate (`src/lib.rs`) exposes `FrameSender` and calls the Obj-C
  shim (`macos/shim.m`), which uploads the pixels into a Metal texture and
  publishes it through `SyphonMetalServer`. Connected clients then read that
  texture GPU-side; the readback in the first step is the only GPU↔CPU trip.
- Syphon itself is **statically linked** from the vendored, BSD-licensed
  sources in `vendor/syphon/` (see `VENDOR.md` for provenance and the one
  local patch). There is no `Syphon.framework` bundle inside Figment.app.
- Server create/destroy runs on a dedicated run-loop thread inside the shim
  so Syphon's discovery announcements work from any Electron process.

## Building

Requires a Rust toolchain (https://rustup.rs) and Xcode command line tools.

```sh
npm run build:native               # current platform + arch (dev / fastdist)
npm run build:native:mac-universal # arm64 + x64, lipo'd (used by dist/dist-mac)
```

For the universal build both targets must be installed once:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

The result is `frameshare.darwin-<arch>.node` (or `-universal`) next to
`index.js`. Binaries are gitignored and built on the machine that packages
the app; `npm run dist`, `dist-mac` and `fastdist` run the right build step
automatically.

## Signing & notarization

Nothing new to configure. The `.node` file is packaged via `asarUnpack`, and
electron-builder's deep-sign signs every Mach-O in the bundle — including
unpacked `.node` files — with the existing Developer ID, hardened runtime and
`res/entitlements.mac.plist` (no additional entitlements are needed; Syphon's
mach IPC is unrestricted outside the App Store sandbox). Notarization is
electron-builder's built-in flow fed by `electron-builder.env`, and it covers
the addon like any other binary in the app. Because Syphon is statically
linked there is no nested framework bundle to re-sign.

## Testing on macOS

1. `npm run build:native && npm start`
2. Add a **Share Image** node anywhere in a rendering chain.
3. Open a Syphon client:
   - **Syphon Simple Client** (zero setup): download "Simple Apps" from
     https://syphon.github.io — Figment should appear in its server list.
   - **Max/MSP**: install the *Syphon* package from the Package Manager,
     then in a patch: `jit.world` (named e.g. `ctx`) →
     `jit.gl.syphonclient @servername Figment`, bang/qmetro its output into
     `jit.gl.videoplane @ctx`. The server shows up under appname "Figment".
4. Things worth checking on first run: colors (RGBA channel order), vertical
   orientation (if frames are upside down, flip the `flipped` argument in
   `frameSharePublish`), server visibility when the client app is launched
   *after* Figment, and resize behavior.

## Notes

- Publishing is skipped while no client is connected (`hasClients`), so an
  idle Share Image node costs nothing but the check.
- The publish path copies pixels synchronously into a Metal texture; the
  readback buffer can be reused immediately. Frame pacing is governed by
  Figment's render loop.
- Spout (Windows) will be a pure-Rust protocol implementation in this same
  crate behind the identical `FrameSender` API.
