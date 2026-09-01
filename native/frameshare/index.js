// Loader for the figment-frameshare native addon.
//
// Looks for a prebuilt .node next to this file, most specific first. Returns
// null when no binary exists for this platform so callers can degrade
// gracefully (frame sharing simply reports unavailable).
//
// Build the binaries with: node scripts/build.mjs (see README.md).

const { existsSync } = require('fs');
const { join } = require('path');

let cached;
let loadError = null;

function candidateNames() {
  const arch = process.arch;
  switch (process.platform) {
    case 'darwin':
      return [`frameshare.darwin-${arch}.node`, 'frameshare.darwin-universal.node'];
    case 'win32':
      return [`frameshare.win32-${arch}.node`];
    default:
      return [`frameshare.${process.platform}-${arch}.node`];
  }
}

function load() {
  if (cached !== undefined) return cached;
  cached = null;
  for (const name of candidateNames()) {
    const binaryPath = join(__dirname, name);
    if (!existsSync(binaryPath)) continue;
    try {
      cached = require(binaryPath);
      return cached;
    } catch (err) {
      loadError = err;
    }
  }
  return cached;
}

function getLoadError() {
  return loadError;
}

module.exports = { load, getLoadError };
