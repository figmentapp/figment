export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
