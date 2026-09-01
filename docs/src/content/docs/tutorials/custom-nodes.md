---
title: 'Creating Custom Nodes'
---

# Creating Custom Nodes

By writing a custom JavaScript node you can add brand‑new image‑processing, audio, or data‑generation to any project.
This guide walks you through the whole workflow – from the UI basics to the final code.

Every node in Figment is written the same way, so once you know the scaffold you can read and change the built-in nodes too.

## What a custom node looks like

Every Figment node follows the same scaffold:

```js
/**
 * @name  Node Name
 * @description  Short description of what the node does.
 * @category  category (e.g. image, audio, data)
 */

const inputPort = node.imageIn('in');
// Add here other parameters as needed...
const outputPort = node.imageOut('out');

node.onStart = async () => {
  /* one‑time init (pipelines, render targets, timers) */
};

node.onRender = () => {
  /* per‑frame processing */
};

node.onStop = () => {
  /* optional cleanup */
};
```

The block above is the template you’ll paste into your new node after you “fork” a Null node (see the UI steps below).

Two globals are available inside a node: `node`, the node you are writing, and `figment`, the graphics toolkit described below. Nodes cannot `import` external libraries.

## Creating a custom node

To create a custom node you need to "fork" it from an existing node. If you want to tweak the code of an existing node, create that one. If you want to start from scratch, use the Null node:

- **Create a Null node:** Double‑click anywhere on the canvas and pick Null from the list.
- **Open the source editor:** Right‑click the new Null node → View Source.
- **Fork the node:** At the bottom of the source panel click Fork.
- **Name your node:** Give it a clear, descriptive name (e.g. “Custom Blur”) and confirm the fork.
- **Replace the code:** In the editor, delete the existing skeleton and replace with your custom code.
- **Build the node:** Click the "Build" button (or type Shift-Enter) to compile the node. Then switch back to the viewer to see the results.

Custom nodes are stored in the `.fgmt` file as source code.

:::info
Figment is actually a custom browser (built in Electron). Use the developer tools (View > Toggle Developer Tools) to debug and inspect your custom node!
:::

## Ports and parameters

Ports are the inputs and outputs of a node. Declare them at the top of the file; the editor builds the parameter panel and the plugs on the node from them.

Inputs that show up as parameters:

- `node.numberIn(name, default, { min, max, step })`: a number slider.
- `node.toggleIn(name, default)`: a checkbox.
- `node.selectIn(name, options, default)`: a drop-down list.
- `node.stringIn(name, default)`: a text field.
- `node.colorIn(name, [r, g, b, a])`: a color picker. Red, green, and blue are 0 to 255; alpha is 0 to 1.
- `node.pointIn(name, point)`: an x/y position.
- `node.fileIn(name)` and `node.directoryIn(name)`: a file or folder chooser.
- `node.triggerButtonIn(name)`: a button. Set `.onTrigger` to react to a click.

Inputs that show up as plugs on the node:

- `node.imageIn(name)`: an image.
- `node.audioIn(name)`: an audio signal.
- `node.booleanIn(name)`: a true/false value.
- `node.objectIn(name)`: any JavaScript value, such as landmarks.
- `node.triggerIn(name)`: a bang. Set `.onTrigger` to react.

Outputs: `imageOut`, `booleanOut`, `numberOut`, `stringOut`, `colorOut`, `objectOut`, and `triggerOut`.

Read a port with `.value` and write an output with `.set(value)`. Every parameter input has an `.onChange` hook that fires when the user changes it. A parameter can also be a plug, so an expression or another node can drive it:

```js
const playIn = node.toggleIn('play', true);
playIn.display = 0x03; // parameter (0x01) and plug (0x02)
```

## Writing a GPU filter

Image nodes work on the GPU. An image in Figment is a texture that never leaves the graphics card, and a filter is a small program in [WGSL](https://www.w3.org/TR/WGSL/), the WebGPU shading language, that computes one output pixel at a time.

The `figment.createImageFilter` helper handles everything around the shader: it creates the `in` and `out` ports, compiles the pipeline, allocates the output image at the size of the input, and draws every frame. You supply the pixel function and the parameter values.

```js
/**
 * @name Saturation
 * @description Change the saturation of the image.
 * @category image
 */

const saturationIn = node.numberIn('saturation', 1.0, { min: 0, max: 2, step: 0.01 });

figment.createImageFilter(node, {
  label: 'saturation',
  uniforms: { u_saturation: 'f32' },
  wgsl: `
    let c = textureSample(u_input_texture, defaultSampler, in.uv);
    let luma = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
    return vec4f(mix(vec3f(luma), c.rgb, u.u_saturation), c.a);
  `,
  getUniforms: () => ({ u_saturation: saturationIn.value }),
});
```

Inside the `wgsl` block you can use:

- `in.uv`: the position of the pixel, from `(0, 0)` at the top left to `(1, 1)` at the bottom right.
- `u_input_texture` and `defaultSampler`: the input image. Read it with `textureSample(u_input_texture, defaultSampler, in.uv)`.
- `u.<name>`: the uniforms you declared. Give each one a WGSL type: `f32`, `i32`, `u32`, `vec2f`, `vec3f`, `vec4f`, `mat3x3f`, or `mat4x4f`. `getUniforms` returns the values for the current frame.

The block is the body of the fragment function, so it ends with `return` of a `vec4f` color, with each channel from 0 to 1. To write helper functions, or to take control of the entry point, include the whole `@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f { ... }` yourself; the helper detects it. The Levels node is an example.

Two variations of the helper cover the other common shapes:

- `figment.createImageGenerator(node, { label, uniforms, wgsl, getUniforms, getSize })` makes a node with no input. `getSize` returns the `{ width, height }` of the output. See the Constant node.
- `figment.createFeedbackFilter(node, { label, uniforms, wgsl, getUniforms })` keeps the previous output and passes it to the shader as `u_feedback_texture`. Trail and Smooth are built on it.

## Taking full control

The helpers assume one input and an output of the same size. For anything else, such as two input images, a fixed output size, or drawing with the 2D canvas API, use the building blocks directly:

- `figment.generateWgslPreamble({ uniforms, textures })` writes the WGSL declarations for your uniforms and textures, so the shader can refer to them by name.
- `figment.createRenderPipeline({ wgsl, uniforms, textures, label })` compiles a fragment shader. Do this once, in `onStart`.
- `new figment.RenderTarget({ label })` is an image you can draw into. Call `setSize(width, height)` before drawing; it only reallocates when the size changes.
- `figment.drawFullscreen(pipeline, uniformValues, textureValues, target)` runs the shader over every pixel of the target. Do this in `onRender`, then `imageOut.set(target)`.
- `target.uploadExternal(canvas)` copies an `OffscreenCanvas` or bitmap into a render target. Use it when you draw with the 2D canvas API, as the detection nodes do.
- `await image.readPixels()` reads an image back to the CPU as `ImageData`. This is slow; use it only when you need the pixels in JavaScript.
- `target.destroy()` frees the GPU memory. Call it in `onStop`.

The example below uses this path.

## Example: weather forecast node

We're going to write an image processing node that changes the saturation of the image based on the current weather. To get the current weather, it will fetch it from [Open-Meteo](https://open-meteo.com). This API returns, next to temperature and wind speed, also a [WMO code](https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM) indicating a global weather condition. We provided a mapping from the weather codes to the saturation values; change these as you see fit.

The node will take in the following inputs:

- **`in`**: The input image to manipulate
- **`lat`**: The desired latitude
- **`lon`**: The desired longitude
- **`interval`**: How often the node refreshes the weather (3 hours by default)

It will output the current image.

```js
/**
 * @name Weather Saturation
 * @description Adjusts image saturation based on current weather at (latitude, longitude). Fetches every N hours.
 * @category image
 */

const imageIn = node.imageIn('in');
const latIn = node.numberIn('latitude', 51.26, {
  min: -90,
  max: 90,
  step: 0.01,
});
const lonIn = node.numberIn('longitude', 4.4, {
  min: -180,
  max: 180,
  step: 0.01,
});
const intervalIn = node.numberIn('interval', 3, {
  min: 0.25,
  max: 24,
  step: 0.25,
});
const imageOut = node.imageOut('out');

const DEFAULT_SAT = 0.7;
const WMO_SAT = {
  0: 2.0, // Clear sky
  1: 0.9, // Mainly clear
  2: 0.8, // Partly cloudy
  3: 0.65, // Overcast
  45: 0.45,
  48: 0.45, // Fog / Depositing rime fog
  51: 0.55,
  53: 0.55,
  55: 0.55, // Drizzle (light/mod/heavy)
  56: 0.45,
  57: 0.45, // Freezing drizzle
  61: 0.5,
  63: 0.5,
  65: 0.5, // Rain (light/mod/heavy)
  66: 0.4,
  67: 0.4, // Freezing rain
  71: 0.55,
  73: 0.55,
  75: 0.55, // Snow (light/mod/heavy)
  77: 0.55, // Snow grains
  80: 0.5,
  81: 0.5,
  82: 0.5, // Rain showers (light/mod/heavy)
  85: 0.55,
  86: 0.55, // Snow showers (light/heavy)
  95: 0.35, // Thunderstorm
  96: 0.3,
  99: 0.3, // Thunderstorm with hail (slight/heavy)
};

const uniforms = { u_saturation: 'f32' };
const textures = ['u_input_texture'];
const wgsl =
  figment.generateWgslPreamble({ uniforms, textures }) +
  `
  @fragment
  fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(u_input_texture, defaultSampler, in.uv);
    // Perceptual luma (Rec. 709)
    let luma = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let grey = vec3f(luma);
    // Mix the gray version with the original color
    let rgb = mix(grey, c.rgb, u.u_saturation);
    return vec4f(rgb, c.a);
  }
`;

let _pipeline, _target;
let _timer; // Interval timer
let _saturation = DEFAULT_SAT;

node.onStart = async () => {
  _pipeline = figment.createRenderPipeline({ wgsl, uniforms, textures, label: 'weather-saturation' });
  _target = new figment.RenderTarget({ label: 'weather-saturation' });
  // Fetch immediately, then schedule periodic refreshes.
  await updateWeather();
  rescheduleTimer();
};

node.onRender = () => {
  const img = imageIn.value;
  if (!img) return;
  _target.setSize(img.width, img.height);
  figment.drawFullscreen(_pipeline, { u_saturation: _saturation }, { u_input_texture: img }, _target);
  imageOut.set(_target);
};

node.onStop = () => {
  clearInterval(_timer);
  _target?.destroy();
};

async function updateWeather() {
  const lat = latIn.value;
  const lon = lonIn.value;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  const cw = json && json.current_weather;
  if (!cw) throw new Error('No current_weather in response');
  // cw contains { temperature, windspeed, winddirection, weathercode, time }
  _saturation = WMO_SAT[cw.weathercode] || DEFAULT_SAT;
  console.log('Weather code:', cw.weathercode, 'Saturation:', _saturation);
}

function rescheduleTimer() {
  if (_timer) clearInterval(_timer);
  const intervalMs = Math.max(0.01, intervalIn.value) * 3600 * 1000;
  _timer = setInterval(updateWeather, intervalMs);
}

latIn.onChange = updateWeather;
lonIn.onChange = updateWeather;
intervalIn.onChange = rescheduleTimer;
```

A few things to note:

- The shader is compiled once, in `onStart`. Only the uniform value changes per frame, which is cheap.
- The weather fetch is asynchronous and independent of rendering. `onRender` never waits for the network; it uses whatever saturation value the last fetch produced.
- `onStop` clears the timer. Without it, the fetch would keep running after the node is deleted.

## Get AI Help

We developed a custom Gemini Gem that can help you write or debug custom nodes:

<div style="display: flex; flex-direction: column; gap: 1rem;">
  <a href="https://gemini.google.com/gem/1GfVUo7C5goh4tB-fNv_TSHigXftFrTt0?usp=sharing" target="_blank" rel="noopener noreferrer" style="background-color: #444444; display: flex; flex-direction: row; align-items: center; gap: 0.5rem; padding: 1rem; border-radius: 0.5rem; width: 300px; color: #eee; text-decoration: none;">
    <img src="/img/tutorials/custom-nodes/figment-icon.png" alt="Figment Icon" style="border-radius: 100%; overflow: hidden; width: 44px; height: 44px;" />
    <div style="display: flex; flex-direction: column;">
      <span style="font-size: 1rem; font-weight: 600;">Figment Gem</span>
      <span style="font-size: 0.75rem; font-weight: 600; opacity: 0.6;">Gemini</span>
    </div>
  </a>
</div>

## Example Nodes

You can inspect the code of any node in Figment by right-clicking and choosing "View Source". Furthermore, the code of Figment is also open-source, so you can look at the [src/nodes](https://github.com/figmentapp/figment/tree/main/src/nodes) directory of Figment. Good starting points:

- **Invert** and **Levels**: filters built with `createImageFilter`, the second with helper functions in WGSL.
- **Constant**: a generator.
- **Smooth**: a feedback filter.
- **Composite**: two input images, with the pipeline built by hand.
- **Detect Faces**: a node that draws with the 2D canvas API and uploads the result.
