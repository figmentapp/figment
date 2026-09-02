---
name: ort-release
description: Use when releasing a new build of Figment's onnxruntime-web fork (fdb/onnxruntime). Builds the JS bundle from the fork branch, packs it with the matching upstream wasm, publishes a GitHub release, and points Figment at it. Invoked as /ort-release or /ort-release 1.25.0-fdb.N
---

# Release the onnxruntime-web fork

Figment runs ONNX models with `onnxruntime-web` from `fdb/onnxruntime`, branch
`feat/webgpu-shared-device`: an upstream base commit plus JS-only patches. The
release is a tarball attached to a GitHub release, and Figment's `package.json`
depends on that tarball by URL.

Fork checkout: `/Users/fdb/Source/onnxruntime`. Figment checkout: this repo.

## Version scheme

`<upstream version>-fdb.<N>`, a semver prerelease: `1.25.0-fdb.5` means
"upstream 1.25.0 line, fork build number 5". The counter never resets within an
upstream version; a new upstream base starts a new line (`1.26.0-fdb.1`).

- git tag: `v1.25.0-fdb.5`
- `js/web/package.json` version: `1.25.0-fdb.5` (so `ort.env.versions.web` reports it)
- asset: `onnxruntime-web-1.25.0-fdb.5.tgz`
- URL: `https://github.com/fdb/onnxruntime/releases/download/v1.25.0-fdb.5/onnxruntime-web-1.25.0-fdb.5.tgz`

Releases before this scheme are tagged `shared-device-v1.25.0-patchN` (N up to
4); the counter continues from there.

## Pre-flight checks

In the fork checkout:

1. **Branch**: `feat/webgpu-shared-device`, in sync with `origin` (`git fetch origin` then `git status -sb` shows neither ahead nor behind, except the release commit you are about to make).
2. **Clean tree**: `git status --porcelain` shows nothing except known untracked notes.
3. **Base commit**: `git merge-base HEAD upstream/main` or the first non-fork commit in `git log --oneline` names the upstream base (currently `d626b568e`). The wasm must come from the official npm build of that exact commit: `onnxruntime-web@1.25.0-dev.20260307-d626b568e0`.
4. **Patches are JS-only**: `git diff --stat <base>..HEAD -- . ':!js'` lists only files that do not affect the wasm (C++ under `onnxruntime/core/providers/webgpu` is fine: the JSEP wasm does not contain the native WebGPU provider). Anything under `onnxruntime/core/session`, `onnxruntime/core/framework` or the CPU provider means the upstream wasm no longer matches and this recipe does not apply.
5. **Version**: the previous tag is `git describe --tags --abbrev=0`. If the user gave no version, propose the next `-fdb.N` and ask for confirmation.

Stop and say why if any check fails.

## Build

Node 24 (`~/.vite-plus/bin/node` if the default is newer). No emscripten is needed.

```bash
cd /Users/fdb/Source/onnxruntime/js
[ -d node_modules ] || npm ci
cd common && ([ -d node_modules ] || npm ci) && npm run build && cd ..
cd web && ([ -d node_modules ] || ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci)
```

The JS build validates that the wasm files exist in `dist/`; fetch them from the
upstream build of the base commit once per base:

```bash
[ -f dist/ort-wasm-simd-threaded.jsep.wasm ] || (cd $(mktemp -d) && npm pack onnxruntime-web@1.25.0-dev.20260307-d626b568e0 --silent && tar xzf onnxruntime-web-*.tgz && cp package/dist/ort-wasm-simd-threaded* /Users/fdb/Source/onnxruntime/js/web/dist/)
```

Then bump and build:

1. Set `"version"` in `js/web/package.json` to the new version.
2. `node ../scripts/update-version.js web` regenerates `lib/version.ts`.
3. Commit both files: `chore(release): onnxruntime-web <version>`.
4. `npm run build` in `js/web`.
5. Check the bundle: `grep -c externalDevice dist/ort.all.mjs` is non-zero (the shared-device patch is in) and `grep -o '"<version>"' dist/ort.all.mjs` finds the version.

## Pack

`npm pack` runs `prepack`, which rebuilds and rewrites `onnxruntime-common` from
`file:../common` to an unpublished version, so pack with scripts off and the
dependency pinned by hand, then restore `package.json`:

```bash
cd /Users/fdb/Source/onnxruntime/js/web
cp package.json /tmp/ort-package.json.bak
sed -i '' 's|"onnxruntime-common": "file:../common"|"onnxruntime-common": "1.24.3"|' package.json
npm pack --ignore-scripts --silent
cp /tmp/ort-package.json.bak package.json
```

Drop `package/lib` (TypeScript sources, not needed at runtime):

```bash
T=onnxruntime-web-<version>.tgz
rm -rf /tmp/ortpack && mkdir /tmp/ortpack && tar xzf $T -C /tmp/ortpack && rm -rf /tmp/ortpack/package/lib
(cd /tmp/ortpack && tar czf /Users/fdb/Source/onnxruntime/js/web/$T package)
```

Verify: `tar tzf $T | grep -c '^package/lib/'` is 0, the listing has
`ort-wasm-simd-threaded.jsep.wasm` and `.jsep.mjs`, and
`tar xzf $T -O package/package.json` shows the new version and
`"onnxruntime-common": "1.24.3"`. Expect about 35 MB.

## Test in Figment before publishing

```bash
cd /Users/fdb/Projects/figment
npm install --no-save /Users/fdb/Source/onnxruntime/js/web/onnxruntime-web-<version>.tgz
npm run sync-ort-wasm
node scripts/check-onnx-webgpu.mjs <a model you care about>.onnx
npx playwright test tests/e2e/onnx-webgpu-placement.spec.js
```

Every shipped model must still place all nodes on WebGPU. If the release fixes
a kernel, also run the reproduction for that fix against the new bundle. For a
kernel change, build the app (`npm run fastdist`) and confirm one real model's
output against a CPU reference, since `--no-save` only replaces `node_modules`.

## Review gate

Show the user: old tag → new tag, the commits since the previous tag
(`git log <prev-tag>..HEAD --oneline`), the tarball size and contents summary,
and the release notes draft. **Wait for explicit approval before pushing.**

Release notes name the upstream base commit and the npm dev build the wasm was
taken from, list the fork patches with their commit hashes, and state which
Figment version consumes the release.

## Publish

```bash
cd /Users/fdb/Source/onnxruntime
git tag v<version>
git push origin feat/webgpu-shared-device v<version>
gh release create v<version> js/web/onnxruntime-web-<version>.tgz --title "onnxruntime-web <version>" --notes-file <notes>
```

## Point Figment at it

1. In `package.json`, set the `onnxruntime-web` dependency to the release URL.
2. `npm install` (updates `package-lock.json`), then `npm run sync-ort-wasm` so `assets/onnxruntime-web/` carries the wasm the packaged app serves.
3. `npm test`, `npm run build`, and the placement E2E test.
4. Commit `package.json`, `package-lock.json` and `assets/onnxruntime-web/*` only when the user asks. Do not stage anything else.
