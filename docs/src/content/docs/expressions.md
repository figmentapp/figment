---
title: "Using Expressions"
---

# Using Expressions

<div class="video-wrapper">
  <iframe  src="https://www.youtube-nocookie.com/embed/Zo2Oev1pz10" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

<br/>

All values in Figment also support expressions. These are tiny snippets of code that allow you to change parameters dynamically. For example, you can use expressions to make a value change over time or react to external input via OSC.

Expressions use a JavaScript-like syntax. A basic expression looks like this:

```js
$FRAME / 10;
```

This takes the current frame (an ever-increasing value) and divides it by 10, to slow down the rate of change.

## Using Expressions in Parameters

To use an expression, go to the parameter you want to change and click on the three dots, and choose "Edit Expression". The text field will turn green, indicating that it accepts an expression.

<figure><img src="/img/expressions/simple-expression.png" alt="A simple expression on the rotate parameter"/><figcaption>A simple expression on the rotate parameter</figcaption></figure>

## Built-in Variables

Figment provides a number of built-in variables that you can use in your expressions:

- `$TIME`: The current time in seconds
- `$FRAME`: The current frame
- `$NOW`: The current absolute time, in milliseconds

## Built-in Functions

A number of handy functions are built in to Figment as well:

### Math Functions

- `abs(x)`: Returns the absolute value of a number
- `pow(x, y)`: Returns the value of x to the power of y
- `sqrt(x)`: Returns the square root of x

### Trigonometric Functions

- `sin(x)`: Returns the sine of x
- `cos(x)`: Returns the cosine of x
- `tan(x)`: Returns the tangent of x

### Random Functions

- `random()`: Returns a random number between 0 and 1

### Utility Functions

- `clamp(x, min, max)`: Clamps a value between a minimum and maximum value
- `lerp(a, b, t)`: Linearly interpolates between two values
- `map(x, in_min, in_max, out_min, out_max)`: Maps a value from one range to another

### Time Functions

- `pingPong(min, max, period=1, type="smooth", time=$TIME)` : Returns a value that oscillates between min and max over a period of time. The different types are `"smooth"` (sine wave), `"linear"` (sawtooth wave), or `"step"` (square wave).

### Open Sound Control

- `osc(address, defaultValue)` : Returns the value of an OSC address. The second parameter is the default value if no value was received.

### MIDI

- `midi(channel, controller, defaultValue)` : Returns the value of the knob on a MIDI controller. The first parameter is the midi channel; the second parameter is the controller (knob) number. The third parameter is the default value if no value was received. Use [Protokol](https://hexler.net/protokol) to figure out these values.
- `midipc(channel, defaultValue)` : Returns the program number (0-127) from MIDI Program Change messages on the specified channel. Useful for switching between scenes in conditional nodes, e.g. `midipc(10) == 0` to check if program 0 is active on channel 10.
