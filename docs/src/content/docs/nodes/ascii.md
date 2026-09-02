---
title: 'Ascii'
---

# Ascii

Render the image as a grid of small character glyphs on a black background, like text-mode art. Each cell samples the color of the image under it and picks a glyph for its brightness.

## Parameters

- **Detail** The size of a cell in pixels, from 2 to 50. Smaller cells follow the image more closely.
- **Pixel Size** The size of the dots that make up a glyph.
- **Color** `Color` tints each glyph with the color of the image under it. `Gray` draws every glyph in its brightness only.

## Example

<img src="/img/nodes/ascii.jpg" alt="Figment ascii node example"/>
