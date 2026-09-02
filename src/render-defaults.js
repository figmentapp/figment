// Export defaults derived from the project's Load Movie nodes, shared by the
// Render dialog and the headless --render command line.

function movieMetadata(node) {
  const frameCountPort = node.outPorts.find((p) => p.name === 'frameCount');
  const fpsPort = node.outPorts.find((p) => p.name === 'fps');
  const speedPort = node.inPorts.find((p) => p.name === 'speed');

  const baseFrameCount = Number(frameCountPort?.value) || 0;
  const rawSpeed = Number(speedPort?.value);
  const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
  const adjustedFrameCount = speed === 1 ? baseFrameCount : Math.ceil(baseFrameCount / speed);
  const fps = Number(fpsPort?.value) || 60;

  return { baseFrameCount, adjustedFrameCount, fps, speed };
}

// Returns the longest movie (after speed adjustment) with `movieCount`, or a
// zero-frame, 60 fps default when the network has no Load Movie nodes.
export function detectExportDefaults(network) {
  const movies = network.nodes.filter((n) => n.type === 'image.loadMovie').map(movieMetadata);
  if (movies.length === 0) {
    return { baseFrameCount: 0, adjustedFrameCount: 0, fps: 60, speed: 1, movieCount: 0 };
  }
  const longest = movies.reduce((selected, current) => (current.adjustedFrameCount > selected.adjustedFrameCount ? current : selected));
  return { ...longest, movieCount: movies.length };
}
