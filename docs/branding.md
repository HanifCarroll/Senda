# Senda: Ink + Teal

The approved identity is the open-book mark with a winding path, using palette 02.
The wordmark uses outlined Libre Caslon Display lettering. The interface keeps
its neutral shadcn foundation and system sans-serif text.

## Color roles

The canonical values and mark geometry live in [brand.js](../src/brand.js).

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
Both normal and inverse SVG versions are available. SVG lettering is outlined,
so the browser does not need to download a logo font. The font source is
[Libre Caslon Display](https://github.com/google/fonts/tree/main/ofl/librecaslondisplay),
with its [OFL notice](../public/brand/OFL-LibreCaslonDisplay.txt) included.

The same source generates the web logo, touch/home-screen icons, SVG/ICO/PNG
favicons, email logo, social preview, and data-URI assets for offline bundles.
Offline review files load no external brand resource. Email logos use an inline
MIME attachment, with alt text, rather than a remote image request. A light plate
keeps the image readable in mail clients that override dark colors.

Run `npm run build:brand` after changing the mark, lettering or canonical colors.
This uses the existing Playwright browser; set `SENDA_TEST_BROWSER` when using an
installed Chrome rather than Playwright Chromium. Generated assets are checked
in, so deployments do not fetch a font or regenerate the logo.

Update actual application screenshots when the visible branding changes. Keep
synthetic fixture data and the original screenshot dimensions; the marketing
page and portfolio should show the running product, not a generated UI mockup.
