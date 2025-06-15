/**
 * @name Send OSC
 * @description Send an OSC message.
 * @category comms
 */

const POSE_LANDMARKS = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
];

const valueIn = node.objectIn('value');
const ipIn = node.stringIn('ip', '127.0.0.1');
const portIn = node.numberIn('port', 8000, { min: 0, max: 65535 });
const addressIn = node.stringIn('address', '/test');
const filterIn = node.stringIn('filter', '*');
filterIn.label = 'Pose Filter';

let _filterSet = new Set();

node.onStart = () => {
  _updateFilter();
};

node.onRender = () => {
  _sendMessage();
};

const _sendMessage = () => {
  const ip = ipIn.value;
  const port = portIn.value;
  const address = addressIn.value;
  const value = valueIn.value;
  if (value === undefined || value === null) return;
  if (typeof value === 'number' || typeof value === 'string') {
    window.desktop.oscSendMessage(ip, port, address, [value]);
  } else if (value.type === 'pose' && Array.isArray(value.landmarks)) {
    const points = value.landmarks;
    for (let i = 0; i < POSE_LANDMARKS.length; i++) {
      const name = POSE_LANDMARKS[i];
      if (!_filterSet.has(name)) continue;
      const point = points[i];
      const args = [point.x, point.y, point.z, point.visibility];
      window.desktop.oscSendMessage(ip, port, `${address}/${name}`, args);
    }
  } else {
    const json = JSON.stringify(value);
    window.desktop.oscSendMessage(ip, port, address, [json]);
  }
};

const _updateFilter = () => {
  const filter = filterIn.value.trim();
  if (filter === '' || filter === '*') {
    _filterSet = new Set(POSE_LANDMARKS);
  } else {
    let parts = filter.split(/[\s,]/);
    parts = parts.map((p) => p.trim()).filter((p) => p.length > 0);
    _filterSet = new Set(parts);
  }
};

valueIn.onChange = _sendMessage;
filterIn.onChange = _updateFilter;
