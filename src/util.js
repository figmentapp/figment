export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// From https://stackoverflow.com/a/2970667
export function toCamelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
    if (+match === 0) return '';
    return index == 0 ? match.toLowerCase() : match.toUpperCase();
  });
}
