import JZZ from 'jzz';

let midiInstance = null;
let midiInputs = [];
let midiCallback = null;
let connectedDeviceNames = new Set();

export async function midiStartServer(callback) {
  midiCallback = callback;

  try {
    // Initialize JZZ
    midiInstance = await JZZ();
    midiInstance.onChange = handleMidiDeviceChange;

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
      try {
        const input = await midiInstance.openMidiIn(inputInfo.name);
        input.connect(handleMidiMessage);
        midiInputs.push(input);
        console.log(`Connected to MIDI input: ${inputInfo.name}`);
      } catch (error) {
        console.error(`Failed to connect to MIDI input ${inputInfo.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to initialize MIDI:', error);
  }
}

export function midiStopServer() {
  // Disconnect all MIDI inputs
  midiInputs.forEach((input) => {
    try {
      input.disconnect();
      input.close();
    } catch (error) {
      console.error('Error closing MIDI input:', error);
    }
  });

  midiInputs = [];
  midiCallback = null;
}

function handleMidiMessage(msg) {
  if (!midiCallback) return;

  // Parse MIDI message
  const [status, data1, data2] = msg;

  // Check if it's a Control Change message (0xB0-0xBF)
  if ((status & 0xb0) === 0xb0) {
    const channel = (status & 0x0f) + 1; // Convert to 1-based channel
    const controller = data1;
    const value = data2 / 127.0; // Normalize to 0-1

    // Send to callback
    midiCallback(channel, controller, value);
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
  currentDeviceNames.forEach((deviceName) => {
    if (!connectedDeviceNames.has(deviceName)) {
      connectToDevice(deviceName);
    }
  });
}

async function connectToDevice(deviceName) {
  if (connectedDeviceNames.has(deviceName)) return;

  try {
    const input = await midiInstance.openMidiIn(deviceName);
    input.connect(handleMidiMessage);
    midiInputs.push(input);
    connectedDeviceNames.add(deviceName);
    console.log(`Connected to MIDI input: ${deviceName}`);
  } catch (error) {
    console.error(`Failed to connect to MIDI input ${deviceName}:`, error);
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
}
