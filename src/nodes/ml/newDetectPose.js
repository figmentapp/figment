/**
 * @name New Detect Pose
 * @description Detect pose in an image using MediaPipe
 * @category ml
 */

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

let _vision, _poseLandmarker;
let _framebuffer, _canvas, _ctx, _imageData;

node.onStart = async () => {
  //await figment.loadScripts(['/new-mediapipe/vision_bundle.js', '/new-mediapipe/pose_bundle.js']);
//   _vision = await mediapipe.FilesetResolver.forVisionTasks("/new-mediapipe");
  _vision = await mediapipe.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
  _poseLandmarker = await mediapipe.PoseLandmarker.createFromOptions(
    _vision,
    {
      baseOptions: {
        // modelAssetPath: "/new-mediapipe/pose_landmarker_full.task",
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        // modelAssetPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
        delegate: "webgpuGPU"
      },
      runningMode: 'IMAGE',
      numPoses: 1,
    }
  );

  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');

};

node.onRender = () => {
    if (!imageIn.value) return;
    const width = imageIn.value.width;
    const height = imageIn.value.height;


    if (width !== _canvas.width || height !== _canvas.height) {
        _canvas.width = width;
        _canvas.height = height;
        _imageData = new ImageData(width, height);
        _framebuffer.setSize(width, height);
      }

      imageIn.value.bind();
      window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
      imageIn.value.unbind();
      const pose = _poseLandmarker.detect(_imageData);
      console.log(pose);
      drawResults(pose);

};

function drawResults(pose) {
    if (!imageIn.value || !pose) return;
    const width = imageIn.value.width;
    const height = imageIn.value.height;
    _ctx.clearRect(0, 0, width, height);
    _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
    _ctx.fillRect(0, 0, width, height);
  
    
}