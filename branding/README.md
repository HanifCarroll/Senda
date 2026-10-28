# Selected Senda artwork

The reference is logo **18** from the original exploration, recolored with palette
**02, Ink + Teal**. See [selected-reference.png](selected-reference.png).

The selected design has two broad pages, one smooth flowing S-shaped opening,
a swept inner tip, and classic serif lettering. The symbol and the space around
it are transparent.

## Canonical source

[artwork.js](artwork.js) contains two independently authored parts:

- The book contours follow the chosen reference. Potrace 2.1.8 traced the page
  silhouettes after a 0.7 px smoothing pass removed raster color fringes.
- The wordmark uses **Times New Roman Regular**, typeset as `Senda` at 48 px with
  normal kerning and no added tracking, then converted directly to vector
  outlines. The type retains its natural proportions; it is not raster-traced.
  The installed macOS font was used only during authoring. No font file, font
  request or system-font dependency is included in the shipped logo.

The wordmark's tight bounds are 114.2109375 × 34.0546875 units. Its top-left is
placed at (110, 17) relative to the book's 91 × 65 coordinate system. This keeps
its scale and spacing close to the chosen design while using smooth letterforms.
The canonical flat colors are defined in src/brand.js.

Earlier versions traced the 113 × 36 px reference lettering, preserving raster
noise as lumpy contours. Do not reuse those paths. Do not generate, smooth or
trace text from the reference image. Edit the typesetting and outline the actual
glyphs if typography needs to change. Do not replace the chosen book with extra
zigzags or a background tile.

## Updating assets

Run `npm run build:brand`. The generated SVGs and PNGs include the web logo, standalone mark,
transparent favicons and icons, light/dark email logos and the social card. Email logos retain their compact display dimensions.
Check the full wordmark both enlarged and at its actual 122 × 36 px email size;
check normal and dark versions on their intended surfaces.
