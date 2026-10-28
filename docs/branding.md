# Senda: Ink + Teal

The approved identity is the open-book mark with a winding path, using palette 02.
The mark follows the selected artwork. Clean Times New Roman Regular outlines
give the wordmark the reference's classic serif style. The interface keeps its
neutral shadcn foundation and system sans-serif text.

## Color roles

The canonical values and mark geometry live in [brand.js](../src/core/brand.js).

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#143D4D` | Primary actions, active tabs, selected diagram outlines |
| Teal | `#2A7F83` | Logo, focus indication, supporting accents |
| Foreground | `#20282B` | Reading text and logo lettering |
| Background | `#F5F8F9` | Page surfaces around white cards and diagrams |
| Tint | `#DDEFF0` | Selected elements and interactive hover backgrounds |
| Muted text | `#52636C` | Supporting copy |
| Border | `#D8E2E6` | Neutral UI boundaries |

Keep the BPMN canvas white and ordinary model elements monochrome. Selection
also uses a heavier outline. Preserve the separate meaning of warnings, errors,
and review outcomes; never use the brand palette to imply a model was approved.
As-is and To-be remain labeled navigation choices. Colors never replace labels.

## Assets

The reusable SVG and PNG files are in [public/brand](../public/brand/logo.svg).
The source outlines live in
[artwork.js](../branding/artwork.js); the [selected reference](../branding/selected-reference.png)
and [artwork notes](../branding/README.md) document the design. Preserve these
outlines when regenerating assets. Never trace lettering from the small raster
reference: it produces uneven stems, distorted counters and lumpy curves.

The same source generates the web logo, touch/home-screen icons, SVG/ICO/PNG
favicons, email logo, social preview, and data-URI assets for offline bundles.
Offline review files load no external brand resource. Email logos use an inline
MIME attachments, with alt text, rather than remote image requests. The logo and
its winding negative space are transparent. Light and dark email appearances use
separate transparent images, with no background plate or image background style.

The email logo displays at 122 × 36 px, with a 2× PNG. Declare its dimensions
in HTML attributes and inline CSS inside a fixed-width presentation table;
attributes alone allowed Apple Mail to enlarge it. Verify email changes in
Apple Mail as well as browser previews.

Run `npm run build:brand` after changing the mark, lettering or canonical colors.
This uses the existing Playwright browser; set `SENDA_TEST_BROWSER` when using an
installed Chrome rather than Playwright Chromium. Generated assets are checked
in, so deployments do not fetch a font or regenerate the logo.

Update actual application screenshots when the visible branding changes. Keep
synthetic fixture data and the original screenshot dimensions; the marketing
page and portfolio should show the running product, not a generated UI mockup.

Google sign-in uses the official multicolor [Google G asset](https://developers.google.com/static/identity/images/g-logo.png), kept at `public/brand/google-g.png`, inside a white outlined button. The provider icon is separate from Senda's mark. Google OAuth branding uses `public/brand/oauth-icon.png`; upload that file in the Google Auth Platform Branding page when the Senda artwork changes. Google stores its own copy of the logo, so a website deployment does not update the consent screen.
