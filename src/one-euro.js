// One-Euro filter (Casiez, Roussel, Vogel 2012): an exponential low-pass
// filter whose cutoff frequency rises with the signal's speed, so a static
// landmark is smoothed hard while a fast one follows the input closely.
//
// This is the same algorithm MediaPipe runs over its landmarks
// (mediapipe/util/filtering/one_euro_filter.cc): the derivative is taken
// from the previous raw sample, and the sample period comes from the
// timestamps, so a dropped frame simply widens `dt`.

// Low-pass alpha for a cutoff frequency (Hz) and a sample period (s).
function smoothingFactor(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  constructor({ minCutoff, beta, derivateCutoff = 1.0 }) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivateCutoff = derivateCutoff;
    this.reset();
  }

  reset() {
    this._t = null;
    this._raw = 0; // previous input
    this._value = 0; // previous output
    this._derivative = 0; // filtered derivative
  }

  // Filters `value` sampled at time `t` (seconds). The first sample after
  // reset() seeds the state and returns unchanged. `valueScale` multiplies
  // the derivative before the cutoff is computed, so `beta` can be tuned
  // independently of the value's units (MediaPipe passes 1 / object size).
  filter(value, t, valueScale = 1) {
    if (this._t === null) {
      this._t = t;
      this._raw = value;
      this._value = value;
      this._derivative = 0;
      return value;
    }
    const dt = t - this._t;
    // Time did not advance: the result would be undefined, so pass through
    // without touching the state (as MediaPipe does).
    if (dt <= 0) return value;
    this._t = t;

    const derivative = ((value - this._raw) * valueScale) / dt;
    const alphaD = smoothingFactor(this.derivateCutoff, dt);
    this._derivative = alphaD * derivative + (1 - alphaD) * this._derivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(this._derivative);
    const alpha = smoothingFactor(cutoff, dt);
    this._raw = value;
    this._value = alpha * value + (1 - alpha) * this._value;
    return this._value;
  }
}

// Filters every axis of every landmark in a list, in place. One filter per
// (landmark, axis); the filters are created on the first call, so a
// smoother is bound to one landmark count.
export class LandmarkSmoother {
  constructor(params) {
    this._params = params;
    this._filters = [];
  }

  // `landmarks`: objects with x, y, z (other fields are left alone).
  // `t`: seconds. The scales are the per-axis `valueScale` of the filters.
  apply(landmarks, t, scaleX = 1, scaleY = 1, scaleZ = 1) {
    const count = landmarks.length;
    if (this._filters.length !== count * 3) {
      this._filters = [];
      for (let i = 0; i < count * 3; i++) this._filters.push(new OneEuroFilter(this._params));
    }
    const filters = this._filters;
    for (let i = 0; i < count; i++) {
      const lm = landmarks[i];
      lm.x = filters[i * 3].filter(lm.x, t, scaleX);
      lm.y = filters[i * 3 + 1].filter(lm.y, t, scaleY);
      lm.z = filters[i * 3 + 2].filter(lm.z, t, scaleZ);
    }
  }
}
