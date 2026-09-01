---
title: 'Shortcut Trigger'
---

# Shortcut Trigger

Turn a keyboard shortcut into a boolean signal. The shortcut is global: it works while another application has the focus, so you can control a running installation from the keyboard without bringing Figment to the front.

Connect the output to the boolean input of a [Conditional](/docs/nodes/conditional) node to switch between two images, or to the **Enable** port of a [Save Image](/docs/nodes/save-image) node to record on demand.

## Parameters

- **Shortcut** The key combination, written as an [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator), for example `CommandOrControl+Shift+P` or `F5`.
- **Mode** `flip-flop` toggles the output on every press. `pulse` sets the output to the opposite of the initial value for one frame, then flips it back.
- **Initial** The value of the output when the project starts.

## Outputs

- **State** The current boolean value.
