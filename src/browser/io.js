function getPackagedFile(filePath) {
  return filePath.replace('examples/', '');
}

function pathToFileURL(filename) {
  return `assets/${filename}`;
  //   url.pathToFileURL(filename).toString();
}

export function setupIoFunctions() {
  window.desktop = {
    getPackagedFile,
    pathToFileURL,
  };
}
