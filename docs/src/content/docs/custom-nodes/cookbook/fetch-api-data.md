---
title: "Call an API from a Node"
description: "How to fetch external API data inside a Figment custom node and drive a WGSL shader with it — a weather-driven saturation filter."
---

# Call an API from a node

Custom nodes run in a full browser environment, so `fetch`, timers and WebSockets all work. This recipe builds an image filter whose saturation follows the current weather at a location, using the free [Open-Meteo](https://open-meteo.com) API.

The pattern: keep the fetched state in a plain variable, feed it to the shader through `getUniforms`, and call `node._markDirty()` when new data arrives so the node re-renders.

```js
/**
 * @name Weather Saturation
 * @description Adjusts image saturation based on current weather at (latitude, longitude). Fetches every N hours.
 * @category image
 */

const latIn = node.numberIn('latitude', 51.26, { min: -90, max: 90, step: 0.01 });
const lonIn = node.numberIn('longitude', 4.4, { min: -180, max: 180, step: 0.01 });
const intervalIn = node.numberIn('interval', 3, { min: 0.25, max: 24, step: 0.25 });

// Map WMO weather codes to saturation values; tweak as you see fit.
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
  label: 'weatherSaturation',
  uniforms: { u_saturation: 'f32' },
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
  if (!cw) throw new Error('No current_weather in response');
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

Key points:

- **Chaining lifecycle callbacks**: [`createImageFilter`](/docs/custom-nodes/api#createimagefilter) assigns `node.onStart`/`onStop`; capture them first, then extend. Overwriting them directly would break the filter's pipeline setup.
- **`node._markDirty()`** requests a re-render when data arrives outside the normal render flow.
- **`port.onChange`** fires when the user edits a parameter — ideal for refetching.
- **Cleanup** — clear timers in `onStop`, or they keep firing after the node is deleted.

The same structure works for any data source: REST APIs, WebSockets (`new WebSocket(...)` with `_markDirty` in `onmessage`), or local files via `figment.urlForAsset`. To fetch images rather than data, see the built-in **Fetch Image** node (`View Source` on it) — it downloads into a [`RenderTarget`](/docs/custom-nodes/api#images-rendertarget) with `createImageBitmap` + `uploadExternal`.
