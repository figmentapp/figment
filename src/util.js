export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function padWithZeroes(value, digits = 4) {
  let str = value.toString();
  while (str.length < digits) {
    str = '0' + str;
  }
  return str;
}
