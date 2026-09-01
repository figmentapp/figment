// Verify the packaged app.asar contains no source maps and ships every
// model / wasm file exactly once. Runs as an electron-builder afterPack hook,
// or standalone: node scripts/check-bundle.js path/to/app.asar
import path from 'node:path';
import { listPackage } from '@electron/asar';

const MODEL_EXT = /\.(onnx|task|tflite|wasm)$/;

export function findBundleProblems(entries) {
  const problems = [];

  const maps = entries.filter((f) => f.endsWith('.map'));
  if (maps.length > 0) {
    problems.push(`${maps.length} source map(s) in bundle, e.g. ${maps[0]}`);
  }

  const byName = new Map();
  for (const f of entries.filter((f) => MODEL_EXT.test(f))) {
    const name = path.posix.basename(f);
    byName.set(name, [...(byName.get(name) ?? []), f]);
  }
  for (const [name, paths] of byName) {
    if (paths.length > 1) {
      problems.push(`${name} ships ${paths.length} times: ${paths.join(', ')}`);
    }
    if (paths.some((p) => p.includes('/node_modules/'))) {
      problems.push(`${name} ships from node_modules: ${paths.join(', ')}`);
    }
  }

  return problems;
}

export function checkAsar(asarPath) {
  const entries = listPackage(asarPath, { isPack: false }).map((f) => f.replaceAll('\\', '/'));
  const problems = findBundleProblems(entries);
  if (problems.length > 0) {
    throw new Error(`Bundle check failed for ${asarPath}:\n  - ${problems.join('\n  - ')}`);
  }
  console.log(`Bundle check passed: ${entries.length} entries in ${asarPath}`);
}

export default async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resources =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');
  checkAsar(path.join(resources, 'app.asar'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  checkAsar(process.argv[2]);
}
