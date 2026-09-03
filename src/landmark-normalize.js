// Global pose normalization (Everybody Dance Now, Chan et al. 2019) for the
// Normalize Pose and Normalize Face nodes: measure where a person is and
// how big they are, then zoom and slide their landmarks so they match the
// body a pose-to-image model was trained on.
//
// Everything is in landmark units: fractions of the image, 0 to 1, origin
// top left, y down, `z` on the same scale as `x`. Pure functions and a small
// estimator; the node passes time in, nothing here touches the GPU.

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// BlazePose: the anchor's x is the hip midpoint (a step forward moves one
// ankle, the hips are the body's root), its y is the ankle line. The size
// is the vertical distance from the ankle line to the nose, so raised arms
// and a bent torso do not change it.
export function measurePose(landmarks) {
  if (!landmarks) return null;
  const nose = landmarks[0];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  if (!nose || !leftHip || !rightHip || !leftAnkle || !rightAnkle) return null;
  const y = midpoint(leftAnkle, rightAnkle).y;
  return { anchor: { x: midpoint(leftHip, rightHip).x, y }, size: y - nose.y };
}

// Face Mesh: the anchor is the midpoint of the outer eye corners, the size
// their distance.
export function measureFace(landmarks) {
  if (!landmarks) return null;
  const left = landmarks[33];
  const right = landmarks[263];
  if (!left || !right) return null;
  return { anchor: midpoint(left, right), size: Math.hypot(right.x - left.x, right.y - left.y) };
}

// Zooms `landmarks` uniformly by reference.size / estimate.size about the
// anchor and slides the anchor onto the reference: the guest keeps their
// own proportions, the model sees the body size and floor it was trained
// on. `frame` is this frame's own measurement, `estimate` the estimator's
// current value, `reference` the values the user typed in; all three are
// { anchor: { x, y }, size }.
//
// `horizontal` picks what happens sideways: `keep` zooms only, `follow`
// moves the estimated (usual) hip x onto the reference x so steps still
// show but a drift across the stage does not, `treadmill` pins this
// frame's hip x to the reference x so all sideways travel is removed.
// Vertical always uses the estimate, so a jump stays a jump.
export function normalizeLandmarks(landmarks, frame, estimate, reference, { horizontal = 'keep' } = {}) {
  if (!frame || !estimate || !estimate.size) return landmarks;
  const s = reference.size / estimate.size;
  const ax = horizontal === 'treadmill' ? frame.anchor.x : estimate.anchor.x;
  const cx = horizontal === 'keep' ? estimate.anchor.x : reference.anchor.x;
  const ay = estimate.anchor.y;
  const cy = reference.anchor.y;
  return landmarks.map((lm) => {
    const out = { ...lm, x: cx + (lm.x - ax) * s, y: cy + (lm.y - ay) * s };
    if (lm.z !== undefined) out.z = lm.z * s;
    return out;
  });
}

// Value at fraction `p` of the sorted values (0 is the smallest, 1 the
// largest). The sample count is on the order of 30 fps × 30 s, a sorted
// copy per call is fine.
function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.round(p * (sorted.length - 1))];
}

// Estimates a person's anchor and size over time, from per-frame
// measurements. `anchorYPercentile` is 0.5 for a plain median; the pose
// recipe uses 0.9 because the lowest the feet get is the standing floor (a
// jump moves the feet up, never down).
//
// Modes: `continuous` keeps the samples of the last `windowSeconds`, so a
// short window follows a person walking toward the camera and a long one
// keeps jumps and crouches. `on reset` is `continuous` for the first
// `windowSeconds` after reset(), then frozen. `manual` returns what
// setManual() was given and ignores push().
export class MeasurementEstimator {
  constructor({ mode = 'continuous', windowSeconds = 3, anchorYPercentile = 0.5 } = {}) {
    this.mode = mode;
    this.windowSeconds = windowSeconds;
    this.anchorYPercentile = anchorYPercentile;
    this._manual = null;
    this.reset();
  }

  reset() {
    this._samples = [];
    this._openedAt = null;
    this._frozen = null;
  }

  setManual(measurement) {
    this._manual = measurement;
  }

  push(measurement, t) {
    if (this.mode === 'manual' || !measurement) return;
    if (this._frozen) return;
    if (this._openedAt === null) this._openedAt = t;
    this._samples.push({ t, x: measurement.anchor.x, y: measurement.anchor.y, size: measurement.size });
    const oldest = t - this.windowSeconds;
    while (this._samples.length && this._samples[0].t < oldest) this._samples.shift();
    if (this.mode === 'on reset' && t - this._openedAt >= this.windowSeconds) {
      this._frozen = this._estimate();
      this._samples = [];
    }
  }

  current() {
    if (this.mode === 'manual') return this._manual;
    if (this._frozen) return this._frozen;
    return this._estimate();
  }

  _estimate() {
    const samples = this._samples;
    if (samples.length === 0) return null;
    return {
      anchor: {
        x: percentile(
          samples.map((s) => s.x),
          0.5,
        ),
        y: percentile(
          samples.map((s) => s.y),
          this.anchorYPercentile,
        ),
      },
      size: percentile(
        samples.map((s) => s.size),
        0.5,
      ),
    };
  }
}

// ─── Node body ──────────────────────────────────────────────────────────────

// What a normalize node needs to know about its landmark type: the
// measurement recipe, the words its ports use, and the defaults.
export const POSE_RECIPE = {
  type: 'pose',
  measure: measurePose,
  anchorYPercentile: 0.9,
  names: { y: 'floor', size: 'height', x: 'x' },
  reference: { y: 0.9, size: 0.6, x: 0.5 },
  horizontal: 'keep',
};

export const FACE_RECIPE = {
  type: 'face',
  measure: measureFace,
  anchorYPercentile: 0.5,
  names: { y: 'eye center y', size: 'eye distance', x: 'eye center x' },
  reference: { y: 0.4, size: 0.25, x: 0.5 },
  horizontal: 'treadmill',
};

const HORIZONTAL_MODES = ['keep', 'follow', 'treadmill'];
const MEASURE_MODES = ['continuous', 'on reset', 'manual'];

// Wires the ports, the estimators (one per person slot) and onRender of a
// Normalize Pose / Normalize Face node. `now` returns seconds and is an
// option so tests can drive time. `draw` makes the node's image side
// (figment.skeletonImage): the drawing ports, the `out` image that goes
// into an ONNX Image Model, and its GPU objects. It is injected so this
// module stays free of GPU code.
export function createNormalizeNode(node, recipe, { now = () => performance.now() / 1000, draw = null } = {}) {
  const { names, reference } = recipe;
  const unit = { min: 0, max: 1, step: 0.01 };

  const landmarksIn = node.objectIn('landmarks');
  const referenceYIn = node.numberIn(`reference ${names.y}`, reference.y, unit);
  const referenceSizeIn = node.numberIn(`reference ${names.size}`, reference.size, unit);
  const referenceXIn = node.numberIn(`reference ${names.x}`, reference.x, unit);
  const horizontalIn = node.selectIn('horizontal', HORIZONTAL_MODES, recipe.horizontal);
  const measureIn = node.selectIn('measure', MEASURE_MODES, 'continuous');
  const windowIn = node.numberIn('window', 3, { min: 0.5, max: 30, step: 0.5 });
  const measureAgainIn = node.triggerButtonIn('measure again');
  const driverYIn = node.numberIn(`driver ${names.y}`, reference.y, unit);
  const driverSizeIn = node.numberIn(`driver ${names.size}`, reference.size, unit);
  const driverXIn = node.numberIn(`driver ${names.x}`, reference.x, unit);

  // The image is the first output: it is what the model consumes.
  const image = draw ? draw(node) : null;
  const landmarksOut = node.objectOut('landmarks');
  const measuredYOut = node.numberOut(`measured ${names.y}`);
  const measuredSizeOut = node.numberOut(`measured ${names.size}`);
  const measuredXOut = node.numberOut(`measured ${names.x}`);

  // One estimator per person slot (index in the landmarks array).
  let _slots = [];

  function slot(i) {
    if (!_slots[i]) {
      _slots[i] = {
        estimator: new MeasurementEstimator({
          mode: measureIn.value,
          windowSeconds: windowIn.value,
          anchorYPercentile: recipe.anchorYPercentile,
        }),
        lastSeen: -Infinity,
      };
    }
    return _slots[i];
  }

  function resetSlots() {
    _slots = [];
  }

  function report(estimate) {
    measuredYOut.value = estimate ? estimate.anchor.y : 0;
    measuredSizeOut.value = estimate ? estimate.size : 0;
    measuredXOut.value = estimate ? estimate.anchor.x : 0;
  }

  node.onRender = () => {
    const input = landmarksIn.value;
    if (!input) {
      landmarksOut.value = null;
      image?.render(null);
      return;
    }
    if (input.type !== recipe.type) {
      landmarksOut.value = input;
      throw new Error(`Normalize ${recipe.type}: expected ${recipe.type} landmarks, got ${input.type}`);
    }

    const t = now();
    const manual = measureIn.value === 'manual';
    const driver = { anchor: { x: driverXIn.value, y: driverYIn.value }, size: driverSizeIn.value };
    const target = { anchor: { x: referenceXIn.value, y: referenceYIn.value }, size: referenceSizeIn.value };
    const options = { horizontal: horizontalIn.value };

    // A slot that disappears for more than a window is a new person next time.
    for (let i = input.landmarks.length; i < _slots.length; i++) {
      if (_slots[i] && t - _slots[i].lastSeen > windowIn.value) _slots[i] = undefined;
    }

    const landmarks = input.landmarks.map((person, i) => {
      const s = slot(i);
      s.lastSeen = t;
      const frame = recipe.measure(person);
      if (manual) s.estimator.setManual(driver);
      else s.estimator.push(frame, t);
      return normalizeLandmarks(person, frame, s.estimator.current(), target, options);
    });

    landmarksOut.value = { ...input, landmarks };
    image?.render(landmarksOut.value);
    report(_slots[0] ? _slots[0].estimator.current() : null);
  };

  if (image) {
    node.onStart = image.start;
    node.onStop = image.stop;
  }

  // Stand still for a moment: the "on reset" gesture. The button is the
  // live one; the network reset happens when an export starts.
  measureAgainIn.onTrigger = resetSlots;
  node.onReset = resetSlots;
  measureIn.onChange = resetSlots;
  windowIn.onChange = resetSlots;
}
