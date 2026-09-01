# Vendored Syphon-Framework sources

Source: https://github.com/Syphon/Syphon-Framework
Commit: 71351d4b484cd2d1917867f7846a5cdca724552d (2025-10-06)
License: Simplified BSD — see License.txt in this directory.

This is a subset of the framework: the server-side (publishing) code paths
plus the Metal renderer. The OpenGL server/client files and the Metal client
files are intentionally not vendored; add them from the same commit if a
Syphon receive node is ever built (SyphonClientBase.h is included
header-only because SyphonSubclassing.h imports it).

Local modifications (marked with `FIGMENT PATCH` comments):

- `SyphonServerRendererMetal.m`: falls back to compiling the Metal shaders
  from embedded source (`macos/SyphonMetalShadersEmbedded.h`) when
  `newDefaultLibraryWithBundle:` finds no compiled `default.metallib`.
  Figment links Syphon statically into its native addon, so there is no
  framework bundle to load the metallib from.
- `SyphonServerBase.m`: adds the global `SyphonServerAppNameOverride`, used
  by `serverDescription` in place of the running application's name when
  set. The server runs in an Electron renderer helper process, whose bundle
  name is "Figment Helper (Renderer)"; the shim sets the override to
  "Figment".

To update: re-copy the files listed here from upstream, re-apply the patches,
and regenerate the embedded shader header with
`python3 scripts/generate-embedded-shader.py`.
