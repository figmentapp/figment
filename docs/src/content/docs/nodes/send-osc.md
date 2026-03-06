---
title: "Send OSC"
---

# Send OSC

This node sends OSC messages to a specified address. The messages can be a number, string, or an object.

:::tip
To see if the right messages are being sent, use the free [Protokol](https://hexler.net/protokol) app.
:::

## Send OSC + Landmark Detection

There is a special mode for sending landmark detection data from pose, hand, or face detection nodes. When connecting the output of a [Detect Pose](./detect-pose), Detect Hands, or Detect Face node to this node, it will send out all individual landmarks as separate messages.

### Message Format

Messages are formatted as: `/address/entityIndex/landmarkName`

For example, if the address is `/landmarks` and detecting a pose, the messages will be:

```text
/landmarks/0/nose 0.35431 0.24342 0.23423478 0.9823
/landmarks/0/left_shoulder 0.25431 0.34342 0.13423478 0.9523
```

The entity index allows tracking multiple detected entities (multiple people, hands, or faces). The values sent are `x`, `y`, `z`, and `visibility` (confidence that the landmark is visible).

### Landmark Filter

Use the Landmark Filter parameter to specify which landmarks to send. By default it sends everything (`*`). The filter supports:

- **Named landmarks**: `right_shoulder, left_shoulder`
- **Wildcards**: `*_shoulder` (matches all shoulders), `left_*` (matches all left-side landmarks)
- **Numeric indices**: `0, 5, 10` (useful for face landmarks)
- **Numeric ranges**: `0-20, 50-100` (useful for face landmarks)

### Pose Landmarks

Here is the full list of pose landmarks:

```text
nose,
left_eye_inner, left_eye, left_eye_outer, right_eye_inner, right_eye, right_eye_outer,
left_ear, right_ear, mouth_left, mouth_right,
left_shoulder, right_shoulder, left_elbow, right_elbow,
left_wrist, right_wrist, left_pinky, right_pinky, left_index, right_index, left_thumb, right_thumb,
left_hip, right_hip, left_knee, right_knee,
left_ankle, right_ankle, left_heel, right_heel, left_foot_index, right_foot_index
```

### Hand Landmarks

Here is the full list of hand landmarks:

```text
wrist,
thumb_cmc, thumb_mcp, thumb_ip, thumb_tip,
index_finger_mcp, index_finger_pip, index_finger_dip, index_finger_tip,
middle_finger_mcp, middle_finger_pip, middle_finger_dip, middle_finger_tip,
ring_finger_mcp, ring_finger_pip, ring_finger_dip, ring_finger_tip,
pinky_mcp, pinky_pip, pinky_dip, pinky_tip
```

### Face Landmarks

Face detection provides 468 landmarks using numeric indices (0-467). Use numeric filters to select specific regions. For example:

- `0-20` for the face outline
- `33, 133, 362, 263` for eye corners
- `50-100` for a specific facial region

## Parameters

- **IP**: The IP address or host name of the machine to send to.
- **Port**: The port to send to.
- **Address**: The OSC address to send to. This should start with a `/`.
- **Landmark Filter**: Filter which landmarks to send. Supports named landmarks, wildcards (`*`), numeric indices, and ranges. Default is `*` (send all).

## Example

<img src="/img/nodes/send-osc-pose.jpg" alt="Figment send osc node sending out pose data"/>
