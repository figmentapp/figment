---
title: "Custom Nodes"
description: "Extend Figment with your own JavaScript + WGSL nodes: anatomy, fork workflow, lifecycle, and the execution environment."
---

# Custom Nodes

Every node in Figment — including all built-in ones — is a small JavaScript file. By writing your own node you can add brand-new image processing, generators, data handling, or communication with the outside world. Image processing runs on the GPU through [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API), with shaders written in [WGSL](https://www.w3.org/TR/WGSL/).

If you want to jump straight to working code, head to the [Cookbook](/docs/custom-nodes/cookbook).

## Anatomy of a node

```js
/**
 * @name Node Name
 * @description Short description of what the node does.
 * @category image
 */

// 1. Declare ports (inputs, parameters, outputs)
const imageIn = node.imageIn('in');
const amountIn = node.numberIn('amount', 0.5, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

// 2. Lifecycle callbacks
node.onStart = async () => {
  /* one-time init: pipelines, render targets, network requests */
};

node.onRender = () => {
  /* called whenever the node needs to re-render */
  imageOut.set(imageIn.value);
};

node.onStop = () => {
  /* optional cleanup: destroy render targets, clear timers */
};
```

The JSDoc header (`@name`, `@description`, `@category`) is what shows up in the node library dialog.

For image work you rarely write the lifecycle by hand — the [`figment.createImageFilter`](/docs/custom-nodes/api#createimagefilter), [`createImageGenerator`](/docs/custom-nodes/api#createimagegenerator) and [`createFeedbackFilter`](/docs/custom-nodes/api#createfeedbackfilter) helpers set up the pipeline, render target and lifecycle for you from a WGSL snippet.

## Creating a custom node (fork workflow)

You create a custom node by "forking" an existing one. To tweak an existing node, fork that one; to start from scratch, fork the **Null** node:

1. **Create a Null node:** double-click the canvas and pick *Null* from the list.
2. **Open the source editor:** right-click the node → *View Source*.
3. **Fork the node:** at the bottom of the source panel, click *Fork*.
4. **Name your node:** give it a clear, descriptive name (e.g. "Custom Blur") and confirm.
5. **Replace the code** with your own.
6. **Build:** click *Build* (or press Shift-Enter) to compile. Switch back to the viewer to see the result.

Custom nodes are stored as source code inside the project's `.fgmt` file, so projects are self-contained.

:::info
Figment is a custom browser (built on Electron). Use the developer tools (View → Toggle Developer Tools) to debug your custom node with `console.log` and breakpoints. Node source gets a `//# sourceURL` so it shows up with a readable filename in stack traces.
:::

## Execution environment

Node source is compiled as `new Function('node', 'figment', source)` and called once when the node is created. That means:

- **Only two names are in scope:** [`node`](/docs/custom-nodes/ports) (declare ports, lifecycle) and [`figment`](/docs/custom-nodes/api) (graphics + utilities). There is no `twgl`, `m4`, `gl`, or module `import`/`require` — nodes cannot import external libraries.
- Browser globals are available: `fetch`, `setInterval`, `AudioContext` (as `window.audioCtx`), `createImageBitmap`, `WebSocket`, and everything else a Chromium page has.
- Top-level code runs once per node instance; keep per-frame work inside `node.onRender`.

## Lifecycle

| Callback | When it runs | Notes |
| --- | --- | --- |
| `node.onStart(node)` | once, when the node starts (project load / node creation / rebuild) | may be `async`; awaited |
| `node.onRender()` | every time the node is dirty and the network renders | may be `async`; set output ports here |
| `node.onStop(node)` | when the node is stopped or deleted | destroy render targets, clear timers |

A node re-renders when one of its inputs changes. If your node produces output on its own schedule (video, webcam, timers, network data), set `node.timeDependent = true` to render continuously, or call `node._markDirty()` to request a single re-render when new data arrives.

## Going deeper

- [Ports & Parameters](/docs/custom-nodes/ports) — every port type, options, `onChange`/`onTrigger`, display flags.
- [The figment API](/docs/custom-nodes/api) — filter/generator helpers, `RenderTarget`, `drawFullscreen`, utilities.
- [Writing Shaders](/docs/custom-nodes/shaders) — the WGSL contract: uniforms, samplers, textures.
- [Cookbook](/docs/custom-nodes/cookbook) — complete, copy-pasteable nodes for common tasks.
- [Custom nodes tutorial](/docs/tutorials/custom-nodes) — a guided walk-through building a weather-driven image filter.
