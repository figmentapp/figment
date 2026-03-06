---
title: "Conditional"
---

# Conditional

This node renders one of two images based on a condition, with smooth fading between them when the condition changes.

## Parameters

- **Condition** A boolean value that determines which image to display. When `true`, shows the "true image"; when `false`, shows the "false image". This parameter supports [expressions](/docs/expressions), making it useful for switching scenes based on MIDI program changes or other dynamic inputs.
- **True Image** The image to display when the condition is true.
- **False Image** The image to display when the condition is false.
- **Fade Time** The duration of the transition between images in seconds. Range: 0.0 to 10.0. Default is 0.5 seconds.
- **Fade Bias** Controls the asymmetry of the fade transition. Range: 0.0 to 1.0. Default is 0.5 (symmetric fade). Values closer to 0 make the fade-out faster, while values closer to 1 make the fade-in faster.

## Outputs

- **Out** The blended output image, transitioning between the true and false images based on the current condition.

## Example Use Cases

### Scene Switching with MIDI

Use MIDI Program Change messages to switch between different visual scenes:

```js
midipc(1, 0) == 0;
```

This expression in the Condition parameter will show the "true image" when MIDI program 0 is active on channel 1, and the "false image" for any other program.

### Time-based Switching

Toggle between images based on time:

```js
$TIME % 10 < 5;
```

This alternates between the two images every 5 seconds.
