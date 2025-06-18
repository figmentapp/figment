/**
 * @name Shortcut Trigger
 * @description Emit a trigger when a global keyboard shortcut is pressed.
 * @category core
 */

const shortcutIn = node.stringIn('shortcut', 'CommandOrControl+Shift+P');
const modeIn = node.selectIn('mode', ['pulse', 'flip-flop'], 'flip-flop');
const defaultIn = node.selectIn('initial', [false, true], false);

const boolOut = node.booleanOut('state', defaultIn.value);

const shortcutId = `shortcut:${node.id}`;

async function registerShortcut(accel) {
  try {
    await window.desktop.registerGlobalShortcut(shortcutId, accel);
  } catch (e) {
    console.error('Failed to register shortcut', accel, e);
  }
}

function doPulse() {
  const pulseValue = !defaultIn.value;
  boolOut.set(pulseValue);
  // Revert on next microtask/frame.
  setTimeout(() => {
    boolOut.set(defaultIn.value);
  }, 0);
}

function doFlipFlop() {
  boolOut.set(!boolOut.value);
}

node.onStart = () => {
  // Initialize boolOut with default value in case defaultIn changed before start
  boolOut.set(defaultIn.value);

  registerShortcut(shortcutIn.value);

  window.desktop.registerListener('shortcut', ({ id }) => {
    if (id !== shortcutId) return;

    if (modeIn.value === 'pulse') {
      doPulse();
    } else {
      doFlipFlop();
    }
  });
};

node.onRender = () => {};

node.onStop = () => {
  window.desktop.unregisterGlobalShortcut(shortcutIn.value);
};

// Re-register when the shortcut string changes.
shortcutIn.onChange = (oldValue, newValue) => {
  window.desktop.unregisterGlobalShortcut(oldValue);
  registerShortcut(newValue);
};

// Update initial value live
defaultIn.onChange = () => {
  boolOut.set(defaultIn.value);
};
