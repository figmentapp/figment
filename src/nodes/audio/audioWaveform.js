/**
 * @name Audio Waveform
 * @description Play audio and visualize its waveform as a texture.
 * @category audio
 */

node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'audio' });
const playToggle = node.toggleIn('play', false);
const imageOut = node.imageOut('out');

let audioElement = null;
let sourceNode = null;
let analyser = null;
let dataArray = null;

let target, pipeline, _waveformTarget;

const WAVEFORM_WGSL = `
struct Uniforms {
  u_resolution_x: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_waveform: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let samples = u.u_resolution_x;
  let idx = floor(in.uv.x * samples);
  let y = textureSample(u_waveform, defaultSampler, vec2f(idx / samples, 0.0)).r;
  let lineY = 0.5 + (y - 0.5) * 0.8;
  let dist = abs(in.uv.y - lineY);
  let line = smoothstep(0.02, 0.0, dist);
  return vec4f(vec3f(line), 1.0);
}
`;

function getFileUrl() {
  if (!fileIn.value) return null;
  return fileIn.value instanceof File ? URL.createObjectURL(fileIn.value) : figment.urlForAsset(fileIn.value);
}

node.onStart = () => {
  audioElement = document.createElement('audio');
  audioElement.loop = true;
  audioElement.muted = false;
  audioElement.volume = 1.0;

  analyser = window.audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  dataArray = new Uint8Array(analyser.fftSize);

  sourceNode = window.audioCtx.createMediaElementSource(audioElement);
  sourceNode.connect(analyser);
  analyser.connect(window.audioCtx.destination);

  pipeline = figment.createRenderPipeline({
    wgsl: WAVEFORM_WGSL,
    uniforms: { u_resolution_x: 'float' },
    textures: ['u_waveform'],
    label: 'audioWaveform',
  });
  target = new figment.RenderTarget({ label: 'audioWaveform' });

  _waveformTarget = new figment.RenderTarget({ label: 'waveform data' });
  _waveformTarget.setSize(dataArray.length, 1);
};

async function loadAudio() {
  const fileUrl = getFileUrl();
  if (!fileUrl || !audioElement) return;

  audioElement.pause();
  audioElement.src = fileUrl;

  await new Promise((resolve) => {
    audioElement.addEventListener('canplay', resolve, { once: true });
  });
}

node.onRender = async () => {
  if (!audioElement || !window.audioCtx) return;

  const fileUrl = getFileUrl();
  if (fileUrl && audioElement.src !== fileUrl) {
    await loadAudio();
  }

  if (playToggle.value && audioElement.paused) {
    if (window.audioCtx.state === 'suspended') {
      await window.audioCtx.resume();
    }
    try {
      await audioElement.play();
    } catch (err) {
      console.warn('Playback blocked:', err);
    }
  } else if (!playToggle.value && !audioElement.paused) {
    audioElement.pause();
  }

  if (analyser) {
    analyser.getByteTimeDomainData(dataArray);

    const rgba = new Uint8Array(dataArray.length * 4);
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i];
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }

    const waveImageData = new ImageData(new Uint8ClampedArray(rgba.buffer), dataArray.length, 1);
    const waveBitmap = await createImageBitmap(waveImageData);
    _waveformTarget.uploadExternal(waveBitmap);
    waveBitmap.close();
  }

  target.setSize(512, 256);
  figment.drawFullscreen(pipeline, { u_resolution_x: dataArray.length }, { u_waveform: _waveformTarget }, target);
  imageOut.set(target);
};

node.onStop = () => {
  if (audioElement) audioElement.pause();
  if (sourceNode) sourceNode.disconnect();
  if (analyser) analyser.disconnect();
  target?.destroy();
  _waveformTarget?.destroy();
};
