// Rokoko Studio body → BlazePose landmarks, for the Receive Rokoko node's
// `pose` skeleton: a model trained on Detect Pose drawings must see the
// same 33 points in the same order from motion capture.
//
// Rokoko positions are in meters, y up, left and right the actor's own,
// as BlazePose's are. Joints both systems have map one to one. The face,
// the hand tips and the heels, which the Smartsuit does not track, are
// placed at fixed offsets in meters from the nearest tracked joint, in the
// frame spanned by the neck-to-head direction and the shoulder line. The
// finger joints of the Smartgloves replace the hand offsets when the stream
// carries them.

const ZERO = { x: 0, y: 0, z: 0 };

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a, fallback) {
  const len = length(a);
  return len > 1e-6 ? scale(a, 1 / len) : fallback;
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

// `origin` plus `up`, `right` and `forward` steps in meters.
function offset(origin, frame, u, r, f) {
  return {
    x: origin.x + frame.up.x * u + frame.right.x * r + frame.forward.x * f,
    y: origin.y + frame.up.y * u + frame.right.y * r + frame.forward.y * f,
    z: origin.z + frame.up.z * u + frame.right.z * r + frame.forward.z * f,
  };
}

// The joints every landmark below reads; without one of them there is no
// pose. leftToe/rightToe stand in for the toe ends of older streams.
const REQUIRED = [
  'neck',
  'head',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftUpLeg',
  'rightUpLeg',
  'leftLeg',
  'rightLeg',
  'leftFoot',
  'rightFoot',
  'leftToe',
  'rightToe',
];

// Head: the Rokoko head joint sits at the base of the skull. Eyes, nose,
// ears and mouth are an adult head's proportions above and in front of it.
const HEAD_OFFSETS = {
  nose: [0.07, 0, 0.1],
  eyeInner: [0.1, 0.02, 0.08],
  eye: [0.1, 0.035, 0.075],
  eyeOuter: [0.1, 0.05, 0.065],
  ear: [0.09, 0.075, 0],
  mouth: [0.04, 0.02, 0.09],
};

// Hand without gloves: the BlazePose hand points along the forearm past the
// wrist, spread a little sideways so they do not draw as one dot.
const HAND_OFFSETS = { pinky: [0.08, -0.03], index: [0.09, 0.02], thumb: [0.04, 0.04] };

// The heel is behind the ankle on the toe's height, at this fraction of the
// ankle-to-toe distance.
const HEEL_BACK = 0.4;

function position(joints, name) {
  return joints[name]?.position;
}

function head(joints, frame, side, key) {
  const [u, r, f] = HEAD_OFFSETS[key];
  return offset(position(joints, 'head'), frame, u, r * side, f);
}

// The hand points of one side: the glove's knuckles when
// present, else offsets along the forearm.
function hand(joints, frame, prefix) {
  const wrist = position(joints, `${prefix}Hand`);
  const glove = {
    pinky: position(joints, `${prefix}LittleProximal`),
    index: position(joints, `${prefix}IndexProximal`),
    thumb: position(joints, `${prefix}ThumbMedial`) || position(joints, `${prefix}ThumbProximal`),
  };
  if (glove.pinky && glove.index && glove.thumb) return glove;
  const along = normalize(sub(wrist, position(joints, `${prefix}LowerArm`)), frame.forward);
  // Across the forearm toward the body's front, where the index finger is:
  // the forward direction without its part along the forearm. It stays
  // steady with the arm hanging down; it is only undefined with the forearm
  // pointing straight forward or back, where the up direction stands in.
  const f = frame.forward;
  const fAlong = f.x * along.x + f.y * along.y + f.z * along.z;
  const across = normalize(sub(f, scale(along, fAlong)), frame.up);
  const point = ([a, s]) => ({
    x: wrist.x + along.x * a + across.x * s,
    y: wrist.y + along.y * a + across.y * s,
    z: wrist.z + along.z * a + across.z * s,
  });
  return { pinky: point(HAND_OFFSETS.pinky), index: point(HAND_OFFSETS.index), thumb: point(HAND_OFFSETS.thumb) };
}

function foot(joints, prefix) {
  const ankle = position(joints, `${prefix}Foot`);
  const toe = position(joints, `${prefix}ToeEnd`) || position(joints, `${prefix}Toe`);
  const heel = {
    x: ankle.x + (ankle.x - toe.x) * HEEL_BACK,
    y: toe.y,
    z: ankle.z + (ankle.z - toe.z) * HEEL_BACK,
  };
  return { ankle, heel, toe };
}

// Returns 33 positions in BlazePose order, in Rokoko's coordinates, or
// null when a required joint is missing.
export function rokokoToPose(joints) {
  if (!joints) return null;
  for (const name of REQUIRED) if (!position(joints, name)) return null;

  const up = normalize(sub(position(joints, 'head'), position(joints, 'neck')), { x: 0, y: 1, z: 0 });
  const right = normalize(sub(position(joints, 'rightUpperArm'), position(joints, 'leftUpperArm')), { x: 1, y: 0, z: 0 });
  const forward = normalize(cross(right, up), { x: 0, y: 0, z: 1 });
  const frame = { up, right, forward };

  const left = hand(joints, frame, 'left');
  const rightHand = hand(joints, frame, 'right');
  const leftFoot = foot(joints, 'left');
  const rightFoot = foot(joints, 'right');
  const p = (name) => position(joints, name) || ZERO;

  return [
    head(joints, frame, 0, 'nose'), // 0 nose
    head(joints, frame, -1, 'eyeInner'), // 1 left eye inner
    head(joints, frame, -1, 'eye'), // 2 left eye
    head(joints, frame, -1, 'eyeOuter'), // 3 left eye outer
    head(joints, frame, 1, 'eyeInner'), // 4 right eye inner
    head(joints, frame, 1, 'eye'), // 5 right eye
    head(joints, frame, 1, 'eyeOuter'), // 6 right eye outer
    head(joints, frame, -1, 'ear'), // 7 left ear
    head(joints, frame, 1, 'ear'), // 8 right ear
    head(joints, frame, -1, 'mouth'), // 9 mouth left
    head(joints, frame, 1, 'mouth'), // 10 mouth right
    p('leftUpperArm'), // 11 left shoulder
    p('rightUpperArm'), // 12 right shoulder
    p('leftLowerArm'), // 13 left elbow
    p('rightLowerArm'), // 14 right elbow
    p('leftHand'), // 15 left wrist
    p('rightHand'), // 16 right wrist
    left.pinky, // 17 left pinky
    rightHand.pinky, // 18 right pinky
    left.index, // 19 left index
    rightHand.index, // 20 right index
    left.thumb, // 21 left thumb
    rightHand.thumb, // 22 right thumb
    p('leftUpLeg'), // 23 left hip
    p('rightUpLeg'), // 24 right hip
    p('leftLeg'), // 25 left knee
    p('rightLeg'), // 26 right knee
    leftFoot.ankle, // 27 left ankle
    rightFoot.ankle, // 28 right ankle
    leftFoot.heel, // 29 left heel
    rightFoot.heel, // 30 right heel
    leftFoot.toe, // 31 left foot index
    rightFoot.toe, // 32 right foot index
  ];
}
