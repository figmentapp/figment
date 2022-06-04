## TODO

- Speed up image / webcam pose detection
- Crop input image
- Blob detection
- Composite node: choose input/output size
- Image to Image node: detect input format based on model (256 or 512).

## DONE

- Setup basic model of FBO's using Three.js.
- Decide where functionality of nodes go. Software? WebGL?
- Upgrade Electron
- Move from Preact to React
- Switch to Vite
- Draw previews of nodes
- Use [react-color](https://casesandberg.github.io/react-color/) for the color picker
- Move to model where nodes contain information and not do something directly.
- Use better color picker
- Switch from Three.js to twgl.js.
- Load movie
- Define concept of "rendered node" within the network.
- Use levels to brighten the image
- Change hue/saturation/brightness of the image
- Canny edge detection (using OpenCV ? https://www.npmjs.com/package/opencv-wasm)
- Resize images
- Write unit tests that test the new functionality of the network.
- Use better security for Node.js: https://nodejs.org/api/url.html#url_url_pathtofileurl_path
- Pose detection (mediapipe)
- Face detection (mediapipe)
- Hand detection (mediapipe)
- Composite two images
