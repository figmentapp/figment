---
title: "Custom Node Cookbook"
description: "Complete, copy-pasteable Figment custom nodes: blur filters, generators, API-driven effects, parameters, buttons and feedback loops."
---

# Custom Node Cookbook

Complete, working custom nodes you can paste straight into Figment. Each recipe is verified against the current (WebGPU/WGSL) node API.

To use any of these: double-click the canvas → create a **Null** node → right-click → *View Source* → *Fork* → paste the code → *Build* (Shift-Enter). Full steps in the [Custom Nodes overview](/docs/custom-nodes#creating-a-custom-node-fork-workflow).

- **[Write a blur node](/docs/custom-nodes/cookbook/blur-node)** — a box blur in ~15 lines, plus a separable Gaussian blur.
- **[Write a generator node](/docs/custom-nodes/cookbook/generator-node)** — produce images from scratch: solid color, procedural gradient.
- **[Call an API from a node](/docs/custom-nodes/cookbook/fetch-api-data)** — fetch external data (weather) and drive a shader with it.
- **[Add parameters & buttons](/docs/custom-nodes/cookbook/parameters-and-buttons)** — sliders, dropdowns, checkboxes, file pickers, trigger buttons, `onChange`.
- **[Feedback effects](/docs/custom-nodes/cookbook/feedback-effects)** — trails and decay using the previous frame.

If you're prompting an AI assistant to write a node for you, point it at [figmentapp.com/llms-full.txt](https://figmentapp.com/llms-full.txt) — it contains this entire section as plain markdown.
