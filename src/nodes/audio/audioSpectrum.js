/**
 * @name Audio Spectrum
 * @description Play audio and visualize its spectrum as a texture.
 * @category audio
 */

node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'audio' });
const playToggle = node.toggleIn('play', false);
const bandsIn = node.numberIn('bands', 30, { min: 4, max: 128 });
const spacingIn = node.selectIn('spacing', ['linear', 'log'], 'log');
const imageOut = node.imageOut('out');

let audioElement = null;
let sourceNode = null;
let analyser = null;
let floatArray = null;

let framebuffer, program, spectrumTex;

let bandDefs = [];
let smoothedAmps = [];
let currentSpacing = null;

const fragmentShader = `
precision mediump float;
uniform sampler2D u_spectrum;
uniform float u_bands;
varying vec2 v_uv;

void main() {
  // make sure last band is visible
  float idx = min(floor(v_uv.x * u_bands), u_bands - 1.0);
  float amp = texture2D(u_spectrum, vec2(idx / u_bands, 0.0)).r;

  float lineY = amp;
  float dist = v_uv.y - (1.0 - lineY);
  float visible = step(0.0, dist);

  gl_FragColor = vec4(vec3(visible), 1.0);
}
`;

function buildLinearBands(numBands, fftSize) {
  const bands = [];
  const binsPerBand = Math.floor((fftSize / 2) / numBands);

  for (let i = 0; i < numBands; i++) {
    const binLow = i * binsPerBand;
    let binHigh = (i + 1) * binsPerBand - 1;
    if (i === numBands - 1) binHigh = (fftSize / 2) - 1;
    bands.push({ binLow, binHigh });
  }
  return bands;
}

function buildLogBands(numBands, sampleRate, fftSize) {
  const bands = [];
  const nyquist = sampleRate / 2;
  const minFreq = 20;
  const maxFreq = nyquist;

  for (let i = 0; i < numBands; i++) {
    const freqLow = minFreq * Math.pow(maxFreq / minFreq, i / numBands);
    const freqHigh = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / numBands);

    let binLow = Math.floor((freqLow / nyquist) * (fftSize / 2));
    let binHigh = Math.ceil((freqHigh / nyquist) * (fftSize / 2)) - 1;
    if (binHigh >= fftSize / 2) binHigh = fftSize / 2 - 1;
    if (binHigh < binLow) binHigh = binLow;

    bands.push({ binLow, binHigh });
  }
  return bands;
}

function getAmplitudes(floatData, bands) {
  return bands.map(({ binLow, binHigh }) => {
    let sum = 0;
    for (let i = binLow; i <= binHigh; i++) sum += floatData[i];
    let avg = sum / (binHigh - binLow + 1);
    return Math.min(Math.max((avg + 100) / 100, 0), 1);
  });
}

node.onStart = () => {
  audioElement = document.createElement('audio');
  audioElement.loop = true;
  audioElement.muted = false;
  audioElement.volume = 1.0;

  analyser = window.audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  floatArray = new Float32Array(analyser.frequencyBinCount);

  sourceNode = window.audioCtx.createMediaElementSource(audioElement);
  sourceNode.connect(analyser);
  analyser.connect(window.audioCtx.destination);

  updateBands();

  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function updateBands() {
  const numBands = bandsIn.value;

  if (spacingIn.value === 'linear') {
    bandDefs = buildLinearBands(numBands, analyser.fftSize);
  } else {
    bandDefs = buildLogBands(numBands, window.audioCtx.sampleRate, analyser.fftSize);
  }

  currentSpacing = spacingIn.value;
  smoothedAmps = new Array(numBands).fill(0);

  spectrumTex = twgl.createTexture(window.gl, {
    width: numBands,
    height: 1,
    format: window.gl.RGBA,
    min: window.gl.NEAREST,
    mag: window.gl.NEAREST,
  });
}

async function loadAudio() {
  const fileUrl = !fileIn.value
    ? null
    : fileIn.value instanceof File
      ? URL.createObjectURL(fileIn.value)
      : figment.urlForAsset(fileIn.value);

  if (!fileUrl || !audioElement) return;

  audioElement.pause();
  audioElement.src = fileUrl;

  await new Promise((resolve) => {
    audioElement.addEventListener('canplay', resolve, { once: true });
  });
}

node.onRender = async () => {
  if (!audioElement || !window.audioCtx) return;

  const fileUrl = !fileIn.value
    ? null
    : fileIn.value instanceof File
      ? URL.createObjectURL(fileIn.value)
      : figment.urlForAsset(fileIn.value);

  if (fileUrl && audioElement.src !== fileUrl) {
    await loadAudio();
  }

  if (playToggle.value && audioElement.paused) {
    if (window.audioCtx.state === 'suspended') await window.audioCtx.resume();
    try {
      await audioElement.play();
    } catch (err) {
      console.warn("Playback blocked:", err);
    }
  } else if (!playToggle.value && !audioElement.paused) {
    audioElement.pause();
  }

  if (bandDefs.length !== bandsIn.value || spacingIn.value !== currentSpacing) {
    updateBands();
  }

  analyser.getFloatFrequencyData(floatArray);
  const amps = getAmplitudes(floatArray, bandDefs);

  const smoothing = 0.8;
  for (let i = 0; i < bandsIn.value; i++) {
    smoothedAmps[i] = smoothedAmps[i] * smoothing + amps[i] * (1 - smoothing);
  }

  const newBands = new Map();
  for (let i = 0; i < smoothedAmps.length; i++) {
    newBands.set(i, smoothedAmps[i]);
  }
  setExpressionContext({ _bands: newBands });

  const rgba = new Uint8Array(bandsIn.value * 4);
  for (let i = 0; i < bandsIn.value; i++) {
    const v = Math.floor(smoothedAmps[i] * 255);
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }

  twgl.setTextureFromArray(window.gl, spectrumTex, rgba, {
    width: bandsIn.value,
    height: 1,
    format: window.gl.RGBA,
  });

  framebuffer.setSize(512, 256);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_spectrum: spectrumTex,
    u_bands: bandsIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

node.onStop = () => {
  if (audioElement) audioElement.pause();
  if (sourceNode) sourceNode.disconnect();
  if (analyser) analyser.disconnect();
};
