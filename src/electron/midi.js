import JZZ from 'jzz';
// import 'jazz-midi-electron';

let midiInputs = [];
let midiCallback = null;

export async function midiStartServer(callback) {
  midiCallback = callback;

  try {
    // Initialize JZZ
    const midi = await JZZ();
    console.log('MIDI initialized successfully');

    // Get all available MIDI inputs
    const inputs = midi.info().inputs;
    console.log(
      'Available MIDI inputs:',
      inputs.map((input) => input.name),
    );

    // Connect to all MIDI inputs
    for (const inputInfo of inputs) {
      try {
        const input = await midi.openMidiIn(inputInfo.name);
        input.connect(handleMidiMessage);
        midiInputs.push(input);
        console.log(`Connected to MIDI input: ${inputInfo.name}`);
      } catch (error) {
        console.error(`Failed to connect to MIDI input ${inputInfo.name}:`, error);
      }
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
