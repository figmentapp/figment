// Functions that are available in the "figment" namespace. Related to project files.
// Look in preload.js for functions that are exposed in this module (e.g. nodePath).

export function projectFile() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return window.app.state.filePath;
}

export function projectDirectory() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return path.dirname(window.app.state.filePath);
}

export function filePathForAsset(filename) {
  if (nodePath.isAbsolute(filename)) return filename;
  const filePath = nodePath.join(projectDirectory(), filename);
  return filePath;
}

export function urlForAsset(filename) {
  const filePath = filePathForAsset(filename);
  const absoluteFilePath = nodePath.resolve(filePath);
  const assetUrl = pathToFileURL(absoluteFilePath);
  return assetUrl;
}

export function filePathToRelative(filename) {
  return nodePath.relative(projectDirectory(), filename);
}
