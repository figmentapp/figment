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

const HAND_LANDMARKS = [
  'wrist',
  'thumb_cmc',
  'thumb_mcp',
  'thumb_ip',
  'thumb_tip',
  'index_finger_mcp',
  'index_finger_pip',
  'index_finger_dip',
  'index_finger_tip',
  'middle_finger_mcp',
  'middle_finger_pip',
  'middle_finger_dip',
  'middle_finger_tip',
  'ring_finger_mcp',
  'ring_finger_pip',
  'ring_finger_dip',
  'ring_finger_tip',
  'pinky_mcp',
  'pinky_pip',
  'pinky_dip',
  'pinky_tip',
];

const valueIn = node.objectIn('value');
const ipIn = node.stringIn('ip', '127.0.0.1');
const portIn = node.numberIn('port', 8000, { min: 0, max: 65535 });
const addressIn = node.stringIn('address', '/landmarks');
const filterIn = node.stringIn('filter', '*');
filterIn.label = 'Landmark Filter';

let _filterPatterns = [];
let _filterIndices = new Set();

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
    return;
  }

  if (!value.type || !Array.isArray(value.landmarks)) {
    const json = JSON.stringify(value);
    window.desktop.oscSendMessage(ip, port, address, [json]);
    return;
  }

  const landmarkNames = _getLandmarkNames(value.type);

  // Iterate over each detected entity (person, hand, face)
  for (let entityIndex = 0; entityIndex < value.landmarks.length; entityIndex++) {
    const entityLandmarks = value.landmarks[entityIndex];

    for (let i = 0; i < entityLandmarks.length; i++) {
      const name = landmarkNames ? landmarkNames[i] : String(i);
      if (!_matchesFilter(name)) continue;

      const point = entityLandmarks[i];
      const args = [point.x, point.y, point.z, point.visibility ?? 0];
      window.desktop.oscSendMessage(ip, port, `${address}/${entityIndex}/${name}`, args);
    }
  }
};

const _getLandmarkNames = (type) => {
  switch (type) {
    case 'pose':
      return POSE_LANDMARKS;
    case 'hand':
      return HAND_LANDMARKS;
    case 'face':
      return null; // Use numeric indices for face (468 landmarks)
    default:
      return null;
  }
};

const _patternToRegex = (pattern) => {
  // Escape regex special characters except *, then convert * to .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
  return new RegExp(regexStr);
};

const _matchesFilter = (name) => {
  // Check if name matches any regex pattern
  if (_filterPatterns.some((pattern) => pattern.test(name))) {
    return true;
  }
  // Check if name is a numeric index in the set
  if (_filterIndices.has(name)) {
    return true;
  }
  return false;
};

const _parseFilterPart = (part) => {
  // Check for numeric range (e.g., "10-15")
  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const indices = [];
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      indices.push(String(i));
    }
    return { type: 'indices', values: indices };
  }

  // Check for single number (e.g., "0", "42")
  if (/^\d+$/.test(part)) {
    return { type: 'indices', values: [part] };
  }

  // Otherwise treat as wildcard pattern
  return { type: 'pattern', value: _patternToRegex(part) };
};

const _updateFilter = () => {
  const filter = filterIn.value.trim();
  _filterPatterns = [];
  _filterIndices = new Set();

  if (filter === '' || filter === '*') {
    // Match everything
    _filterPatterns = [/^.*$/];
  } else {
    let parts = filter.split(/[\s,]/);
    parts = parts.map((p) => p.trim()).filter((p) => p.length > 0);

    for (const part of parts) {
      const parsed = _parseFilterPart(part);
      if (parsed.type === 'indices') {
        for (const idx of parsed.values) {
          _filterIndices.add(idx);
        }
      } else {
        _filterPatterns.push(parsed.value);
      }
    }
  }
};

valueIn.onChange = _sendMessage;
filterIn.onChange = _updateFilter;
