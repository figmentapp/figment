---
title: "Ports & Parameters"
description: "Reference for all Figment custom node port types: number, string, color, file, select, toggle, trigger buttons, image, object and audio ports."
---

# Ports & Parameters

Ports are how a node talks to the rest of the network and to the user. Declare them at the top of your node source. Inputs show up either as **parameters** (widgets in the parameter panel) or as **plugs** (connection points on the node), outputs always as plugs.

Reading and writing:

- `port.value` — the current value of an input port.
- `port.set(value)` — set an output port's value and propagate it downstream.
- `port.onChange = (oldValue, newValue) => { … }` — called when the user edits a parameter.
- `port.onTrigger = (props) => { … }` — called when a button is clicked or a trigger arrives.

## Inputs displayed as parameters

| Method | Widget | Default value |
| --- | --- | --- |
| `node.numberIn(name, value, options?)` | number drag | `0` |
| `node.stringIn(name, value)` | text field | `''` |
| `node.toggleIn(name, value?)` | checkbox | `true` |
| `node.colorIn(name, value)` | color picker, `[r, g, b, a]` with 0–255 RGB and 0–1 alpha | `[0, 0, 0, 1]` |
| `node.pointIn(name, value)` | x/y point | `(0, 0)` |
| `node.fileIn(name, value, options?)` | file chooser | `''` |
| `node.directoryIn(name, value)` | directory chooser | `''` |
| `node.selectIn(name, options, value?)` | dropdown; `options` is an array of strings | first option |
| `node.triggerButtonIn(name)` | button; handle clicks with `port.onTrigger` | — |

`numberIn` options: `{ min, max, step }` (step defaults to `1`).
`fileIn` options: `{ fileType }`, e.g. `'image'` (defaults to `'generic'`).

```js
const amountIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001 });
const fileIn = node.fileIn('file', '', { fileType: 'image' });
const modeIn = node.selectIn('mode', ['add', 'multiply', 'screen'], 'add');
const restartIn = node.triggerButtonIn('restart');
restartIn.onTrigger = () => { /* … */ };
```

Number parameters also accept [expressions](/docs/expressions) (`$TIME`, `$FRAME`, OSC/MIDI values) — the user right-clicks the parameter to enter one. Your node just reads `port.value` as usual.

## Inputs displayed as plugs

| Method | Carries |
| --- | --- |
| `node.imageIn(name)` | an image (a `figment.RenderTarget` with `width`, `height`, `texture`, `view`) |
| `node.objectIn(name)` | any JavaScript value (e.g. detection landmarks) |
| `node.booleanIn(name, value?)` | boolean |
| `node.audioIn(name)` | audio |
| `node.triggerIn(name)` | trigger/bang events; handle with `port.onTrigger` |

## Outputs

| Method | Carries |
| --- | --- |
| `node.imageOut(name)` | an image (`RenderTarget`) |
| `node.objectOut(name)` | any JavaScript value |
| `node.booleanOut(name, value?)` | boolean |
| `node.numberOut(name, value?)` | number |
| `node.stringOut(name, value?)` | string |
| `node.colorOut(name, value?)` | color |
| `node.triggerOut(name)` | trigger; fire with `port.trigger(props)` |

Set outputs inside `node.onRender` with `port.set(value)`.

## Display flags

By default image, object and boolean ports show as plugs, everything else as a parameter. You can override this per port:

```js
const playIn = node.toggleIn('play', true);
// Show as BOTH a plug and a parameter:
playIn.display = 0x03; // PORT_DISPLAY_PARAMETER | PORT_DISPLAY_PLUG
```

| Constant | Value |
| --- | --- |
| `PORT_DISPLAY_HIDDEN` | `0x00` |
| `PORT_DISPLAY_PARAMETER` | `0x01` |
| `PORT_DISPLAY_PLUG` | `0x02` |

Don't invent port types — the ones listed on this page are all that exist. See [Add parameters & buttons](/docs/custom-nodes/cookbook/parameters-and-buttons) for a complete worked example.
