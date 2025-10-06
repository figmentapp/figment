/**
 * @name Video Buffer
 * @description Buffer incoming frames into a time- and memory-bounded ring for playback.
 * @category image
 */

node.timeDependent = true;

const imageIn = node.imageIn('in');
const recordIn = node.toggleIn('record', false);
recordIn.display = 0x03;
const whenFinishedIn = node.selectIn('whenFinished', ['loop', 'last frame', 'first frame'], 'loop');
const fpsIn = node.numberIn('fps', 30, { min: 1, max: 120 });
const maxSecondsIn = node.numberIn('maxSeconds', 10, { min: 0.1, max: 600, step: 0.1 });
const clearIn = node.triggerButtonIn('clear');
const restartIn = node.triggerButtonIn('restart');
const imageOut = node.imageOut('out');
// Triggers: emit when recording starts and when playback loops
const recordStartedOut = node.triggerOut('recordStarted');
const loopedOut = node.triggerOut('looped');

// Internal state
let _program;
let _width = 0,
  _height = 0,
  _bytesPerFrame = 0;

let _frames = []; // array of figment.Framebuffer
let _capacity = 0; // max frames we can store
let _size = 0; // number of valid frames currently stored (frozen when record=false)
let _writeIndex = 0; // linear write cursor (0.._capacity)

// Playback state: logical index 0.._size-1
let _playPos = 0;
let _lastRecordTick = 0;
let _lastPlayTick = 0;
let _lastRecordState = recordIn.value;
let _mode = 'playback'; // 'recording' | 'playback'
let _playPaused = false; // true when at end and whenFinished != 'loop'

const ONE_GIB = 1073741824;

node.onStart = () => {
  _program = figment.createShaderProgram();
  resetAll();
};

node.onStop = () => {
  // Keep resources; they will be GC'ed with the node. Nothing to stop explicitly.
};

function resetAll() {
  _width = 0;
  _height = 0;
  _bytesPerFrame = 0;
  _frames = [];
  _capacity = 0;
  _size = 0;
  _writeIndex = 0;
  _playPos = 0;
  _lastRecordTick = 0;
  _lastPlayTick = 0;
  _mode = 'playback';
  _playPaused = false;
}

function clearBuffer() {
  _size = 0;
  _writeIndex = 0;
  _playPos = 0;
  _playPaused = false;
}

function ensureResolutionMatches(input) {
  if (!input) return false;
  const w = input.width;
  const h = input.height;
  if (!w || !h) return false;
  if (w !== _width || h !== _height) {
    _width = w;
    _height = h;
    _bytesPerFrame = _width * _height * 4;
    recomputeCapacity();
    // Resize existing framebuffers to new resolution
    for (let i = 0; i < _frames.length; i++) {
      _frames[i].setSize(_width, _height);
    }
    clearBuffer();
    return true;
  }
  return false;
}

function recomputeCapacity() {
  if (_width <= 0 || _height <= 0) {
    _capacity = 0;
    _frames = [];
    return;
  }
  const timeCapacity = Math.max(1, Math.floor(maxSecondsIn.value * fpsIn.value));
  const memCapacity = Math.max(1, Math.floor(ONE_GIB / _bytesPerFrame));
  const newCapacity = Math.max(1, Math.min(timeCapacity, memCapacity));

  if (newCapacity === _capacity) return;

  // Adjust the frames array to match new capacity
  if (_frames.length === 0) {
    _frames = new Array(newCapacity).fill(null).map(() => new figment.Framebuffer(_width, _height));
    _capacity = newCapacity;
    return;
  }

  if (newCapacity > _capacity) {
    // Grow by appending new framebuffers
    const add = newCapacity - _capacity;
    for (let i = 0; i < add; i++) {
      _frames.push(new figment.Framebuffer(_width, _height));
    }
    _capacity = newCapacity;
  } else {
    // Shrink: keep the first frames up to newCapacity in chronological order (0..keep-1)
    const keep = Math.min(_size, newCapacity);
    _frames = _frames.slice(0, newCapacity);
    _capacity = newCapacity;
    _size = keep;
    _writeIndex = Math.min(_writeIndex, _size);
    _playPos = Math.min(_playPos, Math.max(0, _size - 1));
  }
}

function ensureAllocated() {
  if (_capacity <= 0) return false;
  if (_frames.length !== _capacity) {
    // Initialize or reconcile array size
    const arr = new Array(_capacity);
    for (let i = 0; i < _capacity; i++) {
      arr[i] = _frames[i] || new figment.Framebuffer(_width, _height);
    }
    _frames = arr;
  }
  return true;
}

function physicalIndexForLogical(logicalIndex) {
  // Linear mapping: physical == logical for 0.._size-1
  return logicalIndex;
}

function copyIntoFramebuffer(dstFramebuffer, srcTexture) {
  dstFramebuffer.setSize(_width, _height);
  dstFramebuffer.bind();
  figment.clear();
  figment.drawQuad(_program, { u_image: srcTexture });
  dstFramebuffer.unbind();
}

function recordTick() {
  if (!imageIn.value) return;
  if (_capacity <= 0) return;
  if (!ensureAllocated()) return;

  if (_size >= _capacity) {
    // At capacity: stop adding more frames (no overwrite; linear capture)
    return;
  }

  const dst = _frames[_writeIndex];
  copyIntoFramebuffer(dst, imageIn.value.texture);
  _writeIndex = _writeIndex + 1;
  _size = Math.max(_size, _writeIndex);
  // While recording, keep playhead at latest frame
  _playPos = Math.max(0, _size - 1);
}

function advancePlayback() {
  if (_size <= 0) return;
  if (_playPaused) return;
  const atEnd = _playPos >= _size - 1;
  if (!atEnd) {
    _playPos = Math.min(_size - 1, _playPos + 1);
    return;
  }
  const wf = whenFinishedIn.value;
  if (wf === 'loop') {
    // We're looping back to the first frame
    loopedOut.trigger && loopedOut.trigger();
    _playPos = 0;
  } else if (wf === 'last frame') {
    _playPos = _size - 1;
    _playPaused = true;
  } else if (wf === 'first frame') {
    _playPos = 0;
    _playPaused = true;
  }
}

node.onRender = () => {
  const now = Date.now();

  // First, handle resolution changes when we have input
  if (imageIn.value) {
    const changed = ensureResolutionMatches(imageIn.value);
    if (changed) {
      // Capacity is recomputed and buffers are resized; reset timers
      _lastRecordTick = now;
      _lastPlayTick = now;
    }
  }

  // Transitions for record toggle
  if (recordIn.value && !_lastRecordState) {
    // Enter recording: clear and start from beginning
    clearBuffer();
    _mode = 'recording';
    // Emit recording-started trigger
    recordStartedOut.trigger && recordStartedOut.trigger();
  }
  if (!recordIn.value && _lastRecordState) {
    // Enter playback: freeze the buffer length, rewind, unpause
    _size = Math.min(_size, _capacity);
    _writeIndex = Math.min(_writeIndex, _size);
    _playPos = 0;
    _mode = 'playback';
    _playPaused = false;
    _lastPlayTick = now;
  }
  _lastRecordState = recordIn.value;

  // Sampling cadence for record
  if (_mode === 'recording' && recordIn.value && imageIn.value && _bytesPerFrame > 0) {
    const recordInterval = 1000 / fpsIn.value;
    if (now - _lastRecordTick >= recordInterval) {
      _lastRecordTick = now;
      recordTick();
    }
  }

  // Playback cadence
  if (_mode === 'playback' && !recordIn.value && _size > 0) {
    const playInterval = 1000 / fpsIn.value;
    if (now - _lastPlayTick >= playInterval) {
      _lastPlayTick = now;
      advancePlayback();
    }
  }

  // Choose what to output
  let outputFramebuffer = null;
  const canPassthrough = !!imageIn.value;
  if (_mode === 'recording' && canPassthrough) {
    imageOut.set(imageIn.value);
    return;
  }

  // Otherwise, prefer buffered frame
  if (_size > 0 && _capacity > 0) {
    const phys = physicalIndexForLogical(_playPos);
    outputFramebuffer = _frames[phys];
  }

  if (outputFramebuffer) {
    imageOut.set(outputFramebuffer);
    return;
  }

  // Fallback: if nothing buffered but passthrough is allowed sometimes, try it
  if (canPassthrough) {
    imageOut.set(imageIn.value);
  }
};

function onClear() {
  clearBuffer();
}

function onRestart() {
  _playPos = 0;
  _playPaused = false;
}

function onFpsChange() {
  // Reset cadence timers to avoid long waits after big fps changes
  _lastRecordTick = 0;
  _lastPlayTick = 0;
}

function onCapacityRelatedChange() {
  if (_width > 0 && _height > 0) {
    recomputeCapacity();
  }
}

clearIn.onTrigger = onClear;
restartIn.onTrigger = onRestart;
fpsIn.onChange = onFpsChange;
maxSecondsIn.onChange = onCapacityRelatedChange;
