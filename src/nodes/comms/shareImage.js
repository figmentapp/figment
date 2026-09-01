/**
 * @name Share Image
 * @description Share the image with other apps via Syphon (macOS).
 * @category comms
 */

const imageIn = node.imageIn('in');
const enableIn = node.booleanIn('enable', true);
const serverNameIn = node.stringIn('server name', 'Figment');
const imageOut = node.imageOut('out');

const state = {
  senderId: 0,
  serverName: null,
  warned: false,
  publishing: false,
};

function ensureSender() {
  const serverName = serverNameIn.value || 'Figment';
  if (state.senderId && state.serverName !== serverName) {
    // Rename in place — Syphon keeps connected clients across a rename.
    window.desktop.frameShareSetName(state.senderId, serverName);
    state.serverName = serverName;
  }
  if (!state.senderId) {
    state.senderId = window.desktop.frameShareOpen(serverName);
    state.serverName = serverName;
    if (!state.senderId) {
      throw new Error('Could not start the frame sharing server.');
    }
  }
  return state.senderId;
}

node.onRender = async () => {
  if (!imageIn.value) return;
  imageOut.set(imageIn.value);

  if (!enableIn.value) return;

  if (!window.desktop.frameShareAvailable()) {
    if (!state.warned) {
      state.warned = true;
      console.warn(
        'Share Image: frame sharing is not available on this platform (Syphon requires macOS; the native addon must be built — see native/frameshare/README.md).',
      );
    }
    return;
  }

  const senderId = ensureSender();

  // Readback is the expensive part — skip it entirely while nobody listens
  // and while a previous frame is still on its way to the GPU.
  if (!window.desktop.frameShareHasClients(senderId)) return;
  if (state.publishing) return;

  state.publishing = true;
  try {
    const { width, height, data } = await imageIn.value.readPixelsRaw();
    // The native side copies the pixels synchronously, so the reused
    // readback buffer can be handed over without copying it first.
    window.desktop.frameSharePublish(senderId, data, width, height);
  } finally {
    state.publishing = false;
  }
};

node.onStop = () => {
  if (state.senderId) {
    window.desktop.frameShareClose(state.senderId);
    state.senderId = 0;
    state.serverName = null;
  }
};
