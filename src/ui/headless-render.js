// Headless rendering for `Figment --render`. Runs in the hidden render
// window instead of the React editor: loads the project into the store,
// drives the same export loop as the Render dialog, and reports progress
// and the final result to the main process, which prints them and exits.
import * as figment from '../figment';
import Network from '../model/Network';
import { useAppStore } from './store';
import { upgradeProject } from '../file-format';
import { findWebGLTypes } from '../migration';
import { initExpressionContext } from '../expr';
import { detectExportDefaults } from '../render-defaults';
import { parseSaveImageTemplate, buildSaveImagePath } from '../saveImageShared';
import { createImageEncoder } from '../imageEncoder';

class RenderError extends Error {}

// A Save Image node writes during export only when it is enabled, not set to
// "Never", and has a folder. Mirrors the checks in saveImage.js.
export function hasActiveSaveImageNode(network) {
  return network.nodes.some((node) => {
    if (node.type !== 'image.saveImage') return false;
    const value = (name) => node.inPorts.find((p) => p.name === name)?.value;
    return value('enable') !== false && value('Save') !== 'Never' && !!value('folder');
  });
}

// The network logs a node's render error and carries on; a headless run must
// stop instead, or it reports success for frames that were never written.
function throwOnNodeErrors(network) {
  const failed = network.nodes.find((n) => n.error);
  if (!failed) return;
  const firstLine = String(failed.error).split('\n')[0];
  throw new RenderError(`Node "${failed.name}" failed: ${firstLine}`);
}

async function loadProject(filePath) {
  const contents = await window.desktop.readProjectFile(filePath);
  let project;
  try {
    project = upgradeProject(JSON.parse(contents));
  } catch (err) {
    throw new RenderError(`Cannot open ${filePath}: ${err.message}`);
  }
  if (findWebGLTypes(project).length > 0) {
    throw new RenderError('The project still has WebGL nodes. Open it in Figment once to migrate it.');
  }
  const network = new Network(useAppStore.getState().library);
  useAppStore.setState({ filePath, network, selection: new Set() });
  network.parse(project);
  await network.start();
  return network;
}

// Writes the Out node image for each frame, encoding off the main thread.
function createOutWriter(template, quality) {
  const dir = window.nodePath.dirname(template);
  const parsed = parseSaveImageTemplate(window.nodePath.basename(template));
  const encoder = createImageEncoder();
  let pending = null;
  return {
    async prepare() {
      await window.desktop.ensureDirectory(dir);
    },
    async write(outNode, frame) {
      const image = outNode.outPorts[0].value;
      if (!image || !image.texture) {
        throw new RenderError('The Out node has no image. Connect an image to its "in" port.');
      }
      const raw = await image.readPixelsRaw();
      // The readback buffer is reused by the next frame; the encoder takes ownership of the copy.
      const pixels = new Uint8Array(raw.data);
      if (pending) await pending;
      const filePath = buildSaveImagePath(dir, parsed.template, frame, parsed.digits);
      pending = encoder.encodeAndSave({
        rgbaBuffer: pixels,
        width: raw.width,
        height: raw.height,
        filePath,
        imageType: parsed.imageType,
        imageQuality: quality,
      });
    },
    async finish() {
      try {
        if (pending) await pending;
      } finally {
        pending = null;
        encoder.terminate();
      }
    },
  };
}

async function render(job) {
  await figment.initGPU({ powerPreference: 'high-performance' });
  // Nodes resolve asset paths and the project directory through window.app.
  window.app = { getState: useAppStore.getState, setState: useAppStore.setState };
  const { oscMessageMap, midiMessageMap, midiProgramChangeMap } = useAppStore.getState();
  initExpressionContext({ _osc: oscMessageMap, _midi: midiMessageMap, _midipc: midiProgramChangeMap });

  const network = await loadProject(job.project);
  const outNode = network.nodes.find((n) => n.type === 'core.out');
  if (!outNode) {
    throw new RenderError('The project has no Out node. Add one and connect the image to render.');
  }
  if (!job.output && !hasActiveSaveImageNode(network)) {
    throw new RenderError('Nothing to write: the project has no active Save Image node. Pass --output to write the Out node image.');
  }

  // The first live frame loads movies, which publish their frame count and fps.
  await network.doFrame();
  throwOnNodeErrors(network);
  const defaults = detectExportDefaults(network);
  const frames = job.frames ?? (defaults.adjustedFrameCount > 0 ? defaults.adjustedFrameCount : 1);
  const fps = job.fps ?? defaults.fps;

  let writer = null;
  if (job.output) {
    if (frames > 1 && !job.output.includes('#')) {
      throw new RenderError(`--output needs # placeholders for the frame number when rendering ${frames} frames, e.g. "frame-####.png".`);
    }
    writer = createOutWriter(job.output, job.quality);
    await writer.prepare();
  }

  window.desktop.renderStarted({ frames, fps });
  try {
    await useAppStore.getState().renderSequence(frames, fps, async (frame) => {
      throwOnNodeErrors(network);
      if (writer) await writer.write(outNode, frame);
      window.desktop.renderProgress(frame, frames);
      return true;
    });
  } finally {
    if (writer) await writer.finish();
  }
  // Stopping flushes the Save Image nodes' pending writes.
  await network.stop();
  return { frames, output: job.output };
}

export async function runHeadlessRender(job) {
  let result;
  try {
    result = { ok: true, ...(await render(job)) };
  } catch (err) {
    console.error(err);
    result = { ok: false, message: err.message };
  }
  await window.desktop.renderFinished(result);
}
