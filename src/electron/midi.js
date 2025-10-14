import JZZ from 'jzz';
// import 'jazz-midi-electron';

let midiInputs = [];
let midiCallback = null;
let midiInstance = null;
let connectedDeviceNames = new Set();

async function connectToDevice(deviceName) {
  if (connectedDeviceNames.has(deviceName)) {
    return; // Already connected
  }

  try {
    const input = await midiInstance.openMidiIn(deviceName);
    input.connect(handleMidiMessage);
    midiInputs.push({ name: deviceName, input });
    connectedDeviceNames.add(deviceName);
    console.log(`Connected to MIDI input: ${deviceName}`);
  } catch (error) {
    console.error(`Failed to connect to MIDI input ${deviceName}:`, error);
  }
}

function disconnectDevice(deviceName) {
  const index = midiInputs.findIndex((item) => item.name === deviceName);
  if (index >= 0) {
    const { input } = midiInputs[index];
    try {
      input.disconnect();
      input.close();
      console.log(`Disconnected MIDI input: ${deviceName}`);
    } catch (error) {
      console.error(`Error closing MIDI input ${deviceName}:`, error);
    }
    midiInputs.splice(index, 1);
    connectedDeviceNames.delete(deviceName);
  }
}

function handleDeviceChange() {
  if (!midiInstance) return;

  const currentDevices = midiInstance.info().inputs.map((input) => input.name);
  const currentDeviceSet = new Set(currentDevices);

  // Disconnect devices that are no longer available
  const devicesToDisconnect = Array.from(connectedDeviceNames).filter((name) => !currentDeviceSet.has(name));
  for (const deviceName of devicesToDisconnect) {
    disconnectDevice(deviceName);
  }

  // Connect to new devices
  for (const deviceName of currentDevices) {
    if (!connectedDeviceNames.has(deviceName)) {
      connectToDevice(deviceName);
    }
  }

  console.log('MIDI devices updated:', Array.from(connectedDeviceNames));
}

export async function midiStartServer(callback) {
  midiCallback = callback;

  try {
    // Initialize JZZ
    midiInstance = await JZZ();
    console.log('MIDI initialized successfully');

    // Set up device change watcher
    midiInstance.onChange(handleDeviceChange);

    // Get all available MIDI inputs and connect
    const inputs = midiInstance.info().inputs;
    console.log(
      'Available MIDI inputs:',
      inputs.map((input) => input.name),
    );

    // Connect to all MIDI inputs
    for (const inputInfo of inputs) {
      await connectToDevice(inputInfo.name);
    }

    if (midiInputs.length === 0) {
      console.log('No MIDI inputs available');
    }
  } catch (error) {
    console.error('Failed to initialize MIDI:', error);
  }
}

export function midiStopServer() {
  // Disconnect all MIDI inputs
  midiInputs.forEach(({ input }) => {
    try {
      input.disconnect();
      input.close();
    } catch (error) {
      console.error('Error closing MIDI input:', error);
    }
  });

  midiInputs = [];
  connectedDeviceNames.clear();
  midiCallback = null;
  midiInstance = null;
  console.log('MIDI server stopped');
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
