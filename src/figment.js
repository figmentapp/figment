// Functions that are available in the "figment" namespace. Related to project files.
const path = require('path');
const url = require('url');

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
  if (path.isAbsolute(filename)) return filename;
  const filePath = path.join(projectDirectory(), filename);
  return filePath;
}

export function urlForAsset(filename) {
  const filePath = filePathForAsset(filename);
  const assetUrl = url.pathToFileURL(filePath);
  return assetUrl;
}

export function filePathToRelative(filename) {
  return path.relative(projectDirectory(), filename);
}
