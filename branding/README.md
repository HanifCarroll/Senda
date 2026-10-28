# Selected Senda artwork

The reference is logo **18** from the original exploration, recolored with palette
**02, Ink + Teal**. See [selected-reference.png](selected-reference.png).

The previous redraw introduced extra bends in the path and substituted thin
Libre Caslon lettering. Do not reuse it. The selected design has two broad pages,
one smooth flowing S-shaped opening, a swept inner tip, and substantial classic
serif lettering.

The production outlines in [artwork.js](artwork.js) are traced directly from the
actual selected reference, including its lettering and relative symbol/text
sizes. Potrace 2.1.8 was used with threshold 128, no speckle removal, and curve
tolerance 0.15. A 0.7 px smoothing pass removes color-fringing noise around the
page silhouettes; the lettering is traced without a substitute font. Potrace is
an authoring tool, not a runtime dependency. The generator
applies the canonical flat colors from src/brand.js.

A transparent image-tool restoration was used as an intermediate comparison.
The final vector contours use the selected reference itself so regeneration
cannot silently substitute a different typeface, shape, or proportions.

## Restoration prompt

Extract and faithfully restore the selected design 18, using palette 02 only.
Preserve the broad rounded page silhouettes, one generous flowing S-shaped path,
the swept inner tip at the bottom of the right page, and the original classic
serif Senda lettering. Place the book to the left of the wordmark as in the
palette reference. Left page #2A7F83; right page #143D4D; lettering #20282B.
Use clean solid fills. All outside space and the path must be alpha transparent.
No background tile, gray plate, white-painted opening, shadows, option numbers,
UI, textures or additional zigzags. Match the reference rather than redesigning it.

## Updating assets

Run npm run build:brand. The generated SVGs and PNGs include normal and inverse
logos, the standalone mark, transparent favicons and icons, two transparent email
logos and the social card. Email logos retain their compact display dimensions.
