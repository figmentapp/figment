---
title: "Creating Custom Nodes"
description: "Tutorial: write your own Figment node in JavaScript + WGSL — from forking a Null node to a weather-driven image filter."
---

# Creating Custom Nodes

By writing a custom JavaScript node you can add brand-new image-processing, audio, or data-generation to any project.
This guide walks you through the whole workflow – from the UI basics to a finished node that drives a GPU shader with live API data.

Alongside this tutorial there is a full [Custom Nodes reference](/docs/custom-nodes) ([ports](/docs/custom-nodes/ports), [the figment API](/docs/custom-nodes/api), [shaders](/docs/custom-nodes/shaders)) and a [cookbook](/docs/custom-nodes/cookbook) of complete example nodes.

## What a custom node looks like

Every Figment node follows the same scaffold:

```js
/**
 * @name  Node Name
 * @description  Short description of what the node does.
 * @category  category (e.g. image, audio, data)
 */

const inputPort = node.imageIn("in");
// Add other parameters as needed...
const outputPort = node.imageOut("out");

node.onStart = async () => {
  /* one-time init (pipelines, render targets, etc.) */
};

node.onRender = () => {
  /* per-frame processing */
};

node.onStop = () => {
  /* optional cleanup */
};
```

Image processing runs on the GPU via WebGPU, with shaders written in [WGSL](/docs/custom-nodes/shaders). For image nodes you usually don't write the lifecycle yourself — the `figment.createImageFilter` helper builds it from a shader snippet, as we'll see below.

## Creating a custom node

To create a custom node you need to "fork" it from an existing node. If you want to tweak the code of an existing node, fork that one. If you want to start from scratch, use the Null node:

- **Create a Null node:** Double-click anywhere on the canvas and pick Null from the list.
- **Open the source editor:** Right-click the new Null node → View Source.
- **Fork the node:** At the bottom of the source panel click Fork.
- **Name your node:** Give it a clear, descriptive name (e.g. "Custom Blur") and confirm the fork.
- **Replace the code:** In the editor, delete the existing skeleton and replace with your custom code.
- **Build the node:** Click the "Build" button (or type Shift-Enter) to compile the node. Then switch back to the viewer to see the results.

Custom nodes are stored in the `.fgmt` file as source code.

:::info
Figment is actually a custom browser (built in Electron). Use the developer tools (View > Toggle Developer Tools) to debug and inspect your custom node!
:::

## Example: weather forecast node

We're going to write an image processing node that changes the saturation of the image based on the current weather. To get the current weather, it will fetch it from [Open-Meteo](https://open-meteo.com). This API returns, next to temperature and wind speed, also a [WMO code](https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM) indicating a global weather condition. We provided a mapping from the weather codes to the saturation values; change these as you see fit.

The node will take in the following inputs:

- **`in`**: The input image to manipulate (added automatically by `createImageFilter`)
- **`latitude`** / **`longitude`**: The desired location
- **`interval`**: How often the node refreshes the weather (3 hours by default)

It will output the processed image.

```js
/**
 * @name Weather Saturation
 * @description Adjusts image saturation based on current weather at (latitude, longitude). Fetches every N hours.
 * @category image
 */

const latIn = node.numberIn("latitude", 51.26, { min: -90, max: 90, step: 0.01 });
const lonIn = node.numberIn("longitude", 4.4, { min: -180, max: 180, step: 0.01 });
const intervalIn = node.numberIn("interval", 3, { min: 0.25, max: 24, step: 0.25 });

// Map WMO weather codes to saturation values.
const DEFAULT_SAT = 0.7;
const WMO_SAT = {
  0: 2.0, // Clear sky
  1: 0.9, 2: 0.8, 3: 0.65, // Mainly clear / partly cloudy / overcast
  45: 0.45, 48: 0.45, // Fog
  51: 0.55, 53: 0.55, 55: 0.55, // Drizzle
  56: 0.45, 57: 0.45, // Freezing drizzle
  61: 0.5, 63: 0.5, 65: 0.5, // Rain
  66: 0.4, 67: 0.4, // Freezing rain
  71: 0.55, 73: 0.55, 75: 0.55, 77: 0.55, // Snow
  80: 0.5, 81: 0.5, 82: 0.5, // Rain showers
  85: 0.55, 86: 0.55, // Snow showers
  95: 0.35, 96: 0.3, 99: 0.3, // Thunderstorm
};

let _saturation = DEFAULT_SAT;
let _timer;

figment.createImageFilter(node, {
  label: "weatherSaturation",
  uniforms: { u_saturation: "f32" },
  wgsl: `
    let c = textureSample(u_input_texture, defaultSampler, in.uv);
    // Perceptual luma (Rec. 709)
    let luma = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let outRgb = mix(vec3f(luma), c.rgb, u.u_saturation);
    return vec4f(outRgb, c.a);
  `,
  getUniforms: () => ({ u_saturation: _saturation }),
});

// createImageFilter installed its own onStart/onStop — chain ours after them.
const filterStart = node.onStart;
node.onStart = async () => {
  filterStart();
  await updateWeather();
  rescheduleTimer();
};

const filterStop = node.onStop;
node.onStop = () => {
  if (_timer) clearInterval(_timer);
  filterStop();
};

async function updateWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latIn.value}&longitude=${lonIn.value}&current_weather=true&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  const cw = json && json.current_weather;
  if (!cw) throw new Error("No current_weather in response");
  _saturation = WMO_SAT[cw.weathercode] ?? DEFAULT_SAT;
  node._markDirty(); // re-render with the new saturation
}

function rescheduleTimer() {
  if (_timer) clearInterval(_timer);
  _timer = setInterval(updateWeather, Math.max(0.25, intervalIn.value) * 3600 * 1000);
}

// Refetch when the user changes a parameter.
latIn.onChange = updateWeather;
lonIn.onChange = updateWeather;
intervalIn.onChange = rescheduleTimer;
```

Let's unpack the interesting parts:

- **`figment.createImageFilter`** declares the `in`/`out` image ports, compiles the WGSL shader, manages the render target, and wires up the render loop. Our shader snippet reads the input pixel, computes its gray value, and mixes between gray and the original color based on the saturation uniform. See [Writing Shaders](/docs/custom-nodes/shaders) for the shader contract.
- **Uniforms** connect JavaScript to the GPU: `uniforms: { u_saturation: "f32" }` declares it, `getUniforms()` supplies the current value on every render, and the shader reads `u.u_saturation`.
- **Chaining lifecycle callbacks**: the helper assigns `node.onStart`/`onStop`, so we capture them first and call them inside our own versions. This is the standard pattern for combining a shader helper with your own setup (network requests, timers) — see [the figment API](/docs/custom-nodes/api#adding-your-own-lifecycle-logic-to-a-helper).
- **`node._markDirty()`** tells Figment the node needs to re-render — necessary because the weather changes outside the normal render flow.
- **`port.onChange`** runs when the user edits a parameter, so we refetch immediately instead of waiting for the next interval.

Connect a webcam or image node to the input, and the output image desaturates when the sky clouds over — or blows out in full saturation on a clear day.

## Get AI Help

AI assistants are great at writing custom nodes — if you give them the right context. Everything they need is bundled at **[figmentapp.com/llms-full.txt](https://figmentapp.com/llms-full.txt)**: paste that link (or its contents) into Claude, ChatGPT or Gemini together with your request. Every docs page also has a *Copy as Markdown* button to grab just that page. A shorter index lives at [figmentapp.com/llms.txt](https://figmentapp.com/llms.txt).

We also developed a custom Gemini Gem that can help you write or debug custom nodes:

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

You can inspect the code of any node in Figment by right-clicking and choosing "View Source". Furthermore, the code of Figment is also open-source, so you can look at the [src/nodes](https://github.com/figmentapp/figment/tree/master/src/nodes) directory of Figment. The [cookbook](/docs/custom-nodes/cookbook) collects complete, annotated examples: [blur](/docs/custom-nodes/cookbook/blur-node), [generators](/docs/custom-nodes/cookbook/generator-node), [API data](/docs/custom-nodes/cookbook/fetch-api-data), [parameters & buttons](/docs/custom-nodes/cookbook/parameters-and-buttons) and [feedback trails](/docs/custom-nodes/cookbook/feedback-effects).
