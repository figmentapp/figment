// Functions that are available in the "figment" namespace. Related to project files.
// import * as path from 'nodePath';
// import * as url from 'nodeUrl';
// const path = window.path;
// const url = window.url;
// const path = require('path');
// const url = require('url');

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
  const assetUrl = nodeUrl.pathToFileURL(filePath);
  return assetUrl;
}

export function filePathToRelative(filename) {
  return nodePath.relative(projectDirectory(), filename);
}
