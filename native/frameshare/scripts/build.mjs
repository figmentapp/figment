#!/usr/bin/env node
// Builds the figment-frameshare native addon and places the resulting
// frameshare.<platform>-<arch>.node next to index.cjs.
//
//   node scripts/build.mjs                 build for the current platform/arch
//   node scripts/build.mjs --universal     macOS only: build arm64 + x64 and
//                                          lipo them into darwin-universal
//   node scripts/build.mjs --debug         debug profile (faster compile)
//   node scripts/build.mjs --postinstall   npm postinstall: macOS only; skip
//                                          with a warning when cargo is
//                                          missing (fail instead under CI)
//
// Requires a Rust toolchain (https://rustup.rs). For --universal you need
// both targets installed:
//   rustup target add aarch64-apple-darwin x86_64-apple-darwin

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const crateDir = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const universal = args.includes('--universal');
const debug = args.includes('--debug');
const postinstall = args.includes('--postinstall');
const profileDir = debug ? 'debug' : 'release';

if (postinstall) {
  if (process.platform !== 'darwin') {
    console.log('frameshare: no backend for this platform yet, skipping native build');
    process.exit(0);
  }
  if (!hasCargo()) {
    console.warn(
      'frameshare: Rust toolchain not found, skipping native build.\n' +
        '  The Share Image node will be unavailable. Install Rust from\n' +
        '  https://rustup.rs and run `npm run build:native`.'
    );
    process.exit(process.env.CI ? 1 : 0);
  }
}

function hasCargo() {
  try {
    execFileSync('cargo', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const DYLIB_NAME = {
  darwin: 'libfigment_frameshare.dylib',
  linux: 'libfigment_frameshare.so',
  win32: 'figment_frameshare.dll',
}[process.platform];

function run(cmd, cmdArgs) {
  console.log(`> ${cmd} ${cmdArgs.join(' ')}`);
  execFileSync(cmd, cmdArgs, { cwd: crateDir, stdio: 'inherit' });
}

function cargoBuild(target) {
  const cargoArgs = ['build'];
  if (!debug) cargoArgs.push('--release');
  if (target) cargoArgs.push('--target', target);
  try {
    run('cargo', cargoArgs);
  } catch (err) {
    if (target) {
      console.error(
        `\nBuild for ${target} failed. If the target is missing, install it with:\n` +
          `  rustup target add ${target}\n`
      );
    }
    throw err;
  }
  const dylib = join(crateDir, 'target', target ?? '', profileDir, DYLIB_NAME);
  if (!existsSync(dylib)) {
    throw new Error(`expected build output not found: ${dylib}`);
  }
  return dylib;
}

if (universal) {
  if (process.platform !== 'darwin') {
    console.error('--universal is only supported on macOS');
    process.exit(1);
  }
  const arm = cargoBuild('aarch64-apple-darwin');
  const x64 = cargoBuild('x86_64-apple-darwin');
  const out = join(crateDir, 'frameshare.darwin-universal.node');
  rmSync(out, { force: true });
  run('lipo', ['-create', '-output', out, arm, x64]);
  console.log(`\nBuilt ${out}`);
} else {
  const dylib = cargoBuild(null);
  const out = join(crateDir, `frameshare.${process.platform}-${process.arch}.node`);
  // Never overwrite a Mach-O in place: macOS caches the code signature per
  // inode, and a process loading the rewritten file dies with
  // "Code Signature Invalid". A fresh file gets a fresh inode.
  rmSync(out, { force: true });
  copyFileSync(dylib, out);
  console.log(`\nBuilt ${out}`);
}
