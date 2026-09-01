import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

// The preload script loads the addon with createRequire, the way it does here.
// package.json declares "type": "module", so the loader must be a .cjs file:
// a .js file would be parsed as ESM and its require() calls would throw.
const require = createRequire(import.meta.url);

describe('frameshare loader', () => {
  test('loads as CommonJS and exposes the loader API', () => {
    const loader = require('../../native/frameshare/index.cjs');
    expect(typeof loader.load).toBe('function');
    expect(typeof loader.getLoadError).toBe('function');
  });

  test('load() degrades to null instead of throwing when no binary exists', () => {
    const loader = require('../../native/frameshare/index.cjs');
    const mod = loader.load();
    expect(mod === null || typeof mod.isAvailable === 'function').toBe(true);
  });
});
