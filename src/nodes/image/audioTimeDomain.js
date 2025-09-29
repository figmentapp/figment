/**
 * @name audio time-domain
 * @description Play audio and visualize its waveform as a texture.
 * @category image
 */

node.timeDependent = true;
const fileIn = node.fileIn('file', '', { fileType: 'audio' });
const playToggle = node.toggleIn('play', false);
const imageOut = node.imageOut('out');

let audioElement = null;
let sourceNode = null;
let analyser = null;
let dataArray = null;

let framebuffer, program, waveformTex;

const fragmentShader = `
precision mediump float;
uniform sampler2D u_waveform;
uniform float u_resolution_x;
varying vec2 v_uv;

void main() {
  float samples = u_resolution_x;
  float idx = floor(v_uv.x * samples);

  // sample red channel → waveform value [0..1]
  float y = texture2D(u_waveform, vec2(idx / samples, 0.0)).r;

  // center waveform at 0.5 (midline), scale ±0.4
  float lineY = 0.5 + (y - 0.5) * 0.8;

  // distance from current pixel to waveform line
  float dist = abs(v_uv.y - lineY);
  float line = smoothstep(0.02, 0.0, dist);

  gl_FragColor = vec4(vec3(line), 1.0);
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

  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();

  waveformTex = twgl.createTexture(window.gl, {
    width: dataArray.length,
    height: 1,
    format: window.gl.RGBA,
    min: window.gl.NEAREST,
    mag: window.gl.NEAREST,
  });
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

    twgl.setTextureFromArray(window.gl, waveformTex, rgba, {
      width: dataArray.length,
      height: 1,
      format: window.gl.RGBA,
    });
  }

  framebuffer.setSize(512, 256);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_waveform: waveformTex,
    u_resolution_x: dataArray.length,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

node.onStop = () => {
  if (audioElement) audioElement.pause();
  if (sourceNode) sourceNode.disconnect();
  if (analyser) analyser.disconnect();
};
