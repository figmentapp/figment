// This script is called from the CI tools.
// It changes the package.json version to a nightly version, which looks like this:
// 0.5.7-nightly.20250616.1d44367

import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

function bumpPatch(semver) {
  const [maj, min, patch] = semver.split('.').map(Number);
  return `${maj}.${min}.${patch + 1}`;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '');
const pkgPath = path.join(repoRoot, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));

// 2. Compute new nightly version string
const baseVersion = pkg.version.split('-')[0]; // strip any prerelease tag
const bumped = bumpPatch(baseVersion); // 0.5.6 -> 0.5.7
const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
let sha = 'unknown';
try {
  sha = execSync('git rev-parse --short=7 HEAD').toString().trim();
} catch {}
const nightly = `${bumped}-nightly.${date}.${sha}`;
console.log(`New nightly version: ${nightly}`);

// 3. Update package.json
pkg.version = nightly;
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`\n🔖 package.json version updated → ${nightly}`);
