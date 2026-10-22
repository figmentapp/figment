import { describe, expect, test } from 'vitest';
import { rokokoToPose } from './rokoko-pose';

// A Rokoko Studio body in a T-pose, facing +z, in meters: only positions,
// the rotations are not read. Left and right are the actor's own.
function joint(x, y, z) {
  return { position: { x, y, z } };
}

const BODY = {
  hip: joint(0, 1.0, 0),
  spine: joint(0, 1.15, 0),
  chest: joint(0, 1.3, 0),
  neck: joint(0, 1.5, 0),
  head: joint(0, 1.6, 0),
  leftShoulder: joint(-0.05, 1.45, 0),
  leftUpperArm: joint(-0.2, 1.45, 0),
  leftLowerArm: joint(-0.5, 1.45, 0),
  leftHand: joint(-0.75, 1.45, 0),
  rightShoulder: joint(0.05, 1.45, 0),
  rightUpperArm: joint(0.2, 1.45, 0),
  rightLowerArm: joint(0.5, 1.45, 0),
  rightHand: joint(0.75, 1.45, 0),
  leftUpLeg: joint(-0.1, 0.95, 0),
  leftLeg: joint(-0.1, 0.5, 0),
  leftFoot: joint(-0.1, 0.08, 0),
  leftToe: joint(-0.1, 0.02, 0.15),
  rightUpLeg: joint(0.1, 0.95, 0),
  rightLeg: joint(0.1, 0.5, 0),
  rightFoot: joint(0.1, 0.08, 0),
  rightToe: joint(0.1, 0.02, 0.15),
};

describe('rokokoToPose', () => {
  test('maps the joints BlazePose and Rokoko share, in BlazePose order', () => {
    const pose = rokokoToPose(BODY);
    expect(pose).toHaveLength(33);
    expect(pose[11]).toEqual(BODY.leftUpperArm.position); // left shoulder
    expect(pose[12]).toEqual(BODY.rightUpperArm.position);
    expect(pose[13]).toEqual(BODY.leftLowerArm.position); // left elbow
    expect(pose[14]).toEqual(BODY.rightLowerArm.position);
    expect(pose[15]).toEqual(BODY.leftHand.position); // left wrist
    expect(pose[16]).toEqual(BODY.rightHand.position);
    expect(pose[23]).toEqual(BODY.leftUpLeg.position); // left hip
    expect(pose[24]).toEqual(BODY.rightUpLeg.position);
    expect(pose[25]).toEqual(BODY.leftLeg.position); // left knee
    expect(pose[26]).toEqual(BODY.rightLeg.position);
    expect(pose[27]).toEqual(BODY.leftFoot.position); // left ankle
    expect(pose[28]).toEqual(BODY.rightFoot.position);
    expect(pose[31]).toEqual(BODY.leftToe.position); // left foot index
    expect(pose[32]).toEqual(BODY.rightToe.position);
  });
});

describe('rokokoToPose synthesized landmarks', () => {
  const pose = rokokoToPose(BODY);
  const close = (p, [x, y, z]) => {
    expect(p.x).toBeCloseTo(x, 5);
    expect(p.y).toBeCloseTo(y, 5);
    expect(p.z).toBeCloseTo(z, 5);
  };

  test('the face sits above and in front of the head joint, ears to the sides', () => {
    close(pose[0], [0, 1.67, 0.1]); // nose: up 0.07, forward 0.1
    close(pose[7], [-0.075, 1.69, 0]); // left ear: on the actor's left (−x)
    close(pose[8], [0.075, 1.69, 0]); // right ear
    expect(pose[2].x).toBeLessThan(pose[5].x); // left eye left of right eye
    expect(pose[9].x).toBeLessThan(pose[10].x); // mouth left of mouth right
  });

  test('without gloves the hand points extend along the forearm past the wrist', () => {
    close(pose[19], [-0.84, 1.45, 0.02]); // left index: 0.09 further out, 0.02 sideways
    close(pose[20], [0.84, 1.45, 0.02]); // right index mirrors it
    close(pose[17], [-0.83, 1.45, -0.03]); // left pinky: 0.08 out, 0.03 the other way
  });

  test('with the arm hanging down, a small sway of the wrist keeps the hand points in place', () => {
    const hanging = { ...BODY, rightLowerArm: joint(0.2, 1.15, 0) };
    const sways = [
      [0.001, 0],
      [0, 0.001],
      [-0.001, 0],
      [0, -0.001],
    ];
    for (const [dx, dz] of sways) {
      const wrist = { x: 0.2 + dx, y: 0.9, z: dz };
      const p = rokokoToPose({ ...hanging, rightHand: { position: wrist } });
      // Index toward the front, pinky toward the back, both below the wrist.
      expect(p[20].z - wrist.z).toBeCloseTo(0.02, 2);
      expect(p[18].z - wrist.z).toBeCloseTo(-0.03, 2);
      expect(Math.abs(p[20].x - wrist.x)).toBeLessThan(0.002);
    }
  });

  test('the heel is behind the ankle, opposite the toe, on the toe height', () => {
    close(pose[29], [-0.1, 0.02, -0.06]); // left heel: 0.4 × 0.15 behind the ankle
    close(pose[30], [0.1, 0.02, -0.06]);
  });

  test('glove finger joints replace the hand offsets', () => {
    const gloved = {
      ...BODY,
      leftLittleProximal: joint(-0.82, 1.43, -0.02),
      leftIndexProximal: joint(-0.83, 1.46, 0.03),
      leftThumbMedial: joint(-0.79, 1.44, 0.05),
    };
    const p = rokokoToPose(gloved);
    expect(p[17]).toEqual(gloved.leftLittleProximal.position);
    expect(p[19]).toEqual(gloved.leftIndexProximal.position);
    expect(p[21]).toEqual(gloved.leftThumbMedial.position);
    expect(p[18]).toEqual(pose[18]); // the right hand has no glove joints
  });

  test('a toe end joint replaces the toe joint', () => {
    const p = rokokoToPose({ ...BODY, leftToeEnd: joint(-0.1, 0.0, 0.22) });
    expect(p[31]).toEqual({ x: -0.1, y: 0.0, z: 0.22 });
  });

  test('a body missing a required joint gives no pose', () => {
    const { leftFoot, ...noFoot } = BODY;
    expect(rokokoToPose(noFoot)).toBeNull();
    expect(rokokoToPose(null)).toBeNull();
    expect(rokokoToPose({})).toBeNull();
  });
});
