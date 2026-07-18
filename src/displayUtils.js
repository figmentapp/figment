// Pure helpers for multi-monitor output: display option labels and
// fit-mode scale math. GPU-independent so they can be unit tested.

export const FIT_MODES = ['contain', 'cover', 'stretch', '1:1'];

// Compute how a texture of texW×texH maps onto a canvas of canvasW×canvasH
// for a given fit mode. Returns the displayed rect (in canvas pixels) and the
// `scale` uniform used by the blit shader (displayed size / canvas size).
export function computeFitScale(mode, canvasW, canvasH, texW, texH) {
  let width, height;
  switch (mode) {
    case 'stretch':
      width = canvasW;
      height = canvasH;
      break;
    case '1:1':
      width = texW;
      height = texH;
      break;
    case 'cover': {
      const s = Math.max(canvasW / texW, canvasH / texH);
      width = texW * s;
      height = texH * s;
      break;
    }
    case 'contain':
    default: {
      const s = Math.min(canvasW / texW, canvasH / texH);
      width = texW * s;
      height = texH * s;
      break;
    }
  }
  return {
    width,
    height,
    offsetX: (canvasW - width) / 2,
    offsetY: (canvasH - height) / 2,
    scale: [width / canvasW, height / canvasH],
  };
}

// Build stable, human-readable select options for a list of displays.
// The leading "Display N" prefix is what gets matched back when a saved
// project is opened on a machine with different monitors.
export function displayOptionLabels(displays) {
  return displays.map((d, i) => {
    const name = d.label || `${d.bounds.width}×${d.bounds.height}`;
    return `Display ${i + 1}: ${name}`;
  });
}

// Parse the display index (0-based) out of an option label. Falls back to 0
// (the primary display) when the value doesn't look like a display option.
// The result is NOT clamped to the number of connected displays.
export function resolveDisplayIndex(value) {
  const m = /^\s*Display\s+(\d+)/i.exec(value || '');
  if (!m) return 0;
  return Math.max(0, parseInt(m[1], 10) - 1);
}
