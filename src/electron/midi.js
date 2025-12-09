import JZZ from 'jzz';
import { EventEmitter } from 'events';

export const midiEmitter = new EventEmitter();

let midiInstance = null;
let midiInputs = [];
let connectedDeviceNames = new Set();
let retryInterval = null;

export function getMidiDevices() {
  return [...connectedDeviceNames];
}

export async function midiStartServer() {
  try {
    // Initialize JZZ
    midiInstance = await JZZ();
    midiInstance.onChange(handleMidiDeviceChange);

    // Get all available MIDI inputs
    const inputs = midiInstance.info().inputs;
    if (inputs.length > 0) {
      console.log(
        'Available MIDI inputs:',
        inputs.map((input) => input.name),
      );
    }

    // Connect to all MIDI inputs
    for (const inputInfo of inputs) {
      await connectToDevice(inputInfo.name);
    }

    midiEmitter.emit('devices', [...connectedDeviceNames]);

    // Start polling for devices that might become available (e.g. other apps closing on Windows)
    if (retryInterval) clearInterval(retryInterval);
    retryInterval = setInterval(checkAndConnectDevices, 3000);
  } catch (error) {
    console.error('Failed to initialize MIDI:', error);
  }
}

export function midiStopServer() {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }

  // Disconnect all MIDI inputs
  [...connectedDeviceNames].forEach((deviceName) => {
    disconnectFromDevice(deviceName);
  });

  midiInputs = [];
  connectedDeviceNames.clear();
  midiInstance = null;
  midiEmitter.removeAllListeners();
}

function handleMidiMessage(msg) {
  // Parse MIDI message
  const [status, data1, data2] = msg;

  // Check if it's a Control Change message (0xB0-0xBF)
  if ((status & 0xb0) === 0xb0) {
    const channel = (status & 0x0f) + 1; // Convert to 1-based channel
    const controller = data1;
    const value = data2 / 127.0; // Normalize to 0-1

    // Emit event
    midiEmitter.emit('message', channel, controller, value);
  }
}

function handleMidiDeviceChange(opts) {
  console.log('MIDI device change detected. opts:', opts);

  if (!midiInstance) return;
  const currentDeviceNames = new Set(midiInstance.info().inputs.map((input) => input.name));
  console.log('MIDI device change detected. Current devices:', [...currentDeviceNames]);
  const disconnectedDevices = [...connectedDeviceNames].filter((name) => !currentDeviceNames.has(name));
  disconnectedDevices.forEach((deviceName) => {
    disconnectFromDevice(deviceName);
  });

  // Use async iteration to ensure we try connecting one by one
  (async () => {
    for (const deviceName of currentDeviceNames) {
      if (!connectedDeviceNames.has(deviceName)) {
        await connectToDevice(deviceName);
      }
    }
  })();
}

async function checkAndConnectDevices() {
  if (!midiInstance) return;
  const inputs = midiInstance.info().inputs;
  for (const input of inputs) {
    if (!connectedDeviceNames.has(input.name)) {
      await connectToDevice(input.name, true);
    }
  }
}

async function connectToDevice(deviceName, quiet = false) {
  if (connectedDeviceNames.has(deviceName)) return;

  try {
    const input = await midiInstance.openMidiIn(deviceName);
    input.connect(handleMidiMessage);
    midiInputs.push(input);
    connectedDeviceNames.add(deviceName);
    console.log(`Connected to MIDI input: ${deviceName}`);
    midiEmitter.emit('devices', [...connectedDeviceNames]);
  } catch (error) {
    if (!quiet) {
      console.error(`Failed to connect to MIDI input ${deviceName}:`, error);
      if (process.platform === 'win32') {
        console.error(
          'On Windows, MIDI devices can typically only be used by one application at a time. Please close other applications using this device.',
        );
      }
    }
  }
}

async function disconnectFromDevice(deviceName) {
  const index = midiInputs.findIndex((input) => input.name() === deviceName);
  if (index === -1) return;
  const input = midiInputs[index];
  try {
    input.disconnect();
    input.close();
    console.log(`Disconnected from MIDI input: ${deviceName}`);
  } catch (error) {
    console.error(`Error disconnecting MIDI input ${deviceName}:`, error);
  }
  midiInputs.splice(index, 1);
  connectedDeviceNames.delete(deviceName);
  midiEmitter.emit('devices', [...connectedDeviceNames]);
}
