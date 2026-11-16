# Public page and screenshot provenance

The public Senda page takes its look from [Granola](https://www.granola.ai) (inspected 28 October 2026) and its section structure from [Activepieces](https://www.activepieces.com) (captured 15 November 2026).

## Look

Granola sets the look: large regular-weight serif headings, a white page with cream (#F7F7F2) panels behind product views, pill buttons, no boxed cards or rules between sections, and one dark band. The pricing cards are the only outlined boxes. Anchor links scroll smoothly unless the visitor prefers reduced motion. The page keeps the Ink + Teal identity. Headings use Newsreader, self-hosted through `@fontsource-variable/newsreader`; body text stays in the interface's system sans-serif, which matches the app and its captures. The warm marketing tokens are scoped to the `.marketing` wrapper in `src/web/styles.css`, so the app's colors are unchanged. The artwork (`src/web/components/path-art.tsx`) is generated SVG in ink: winding contour lines after the logo's path, with a light grain. Use it only behind the hero illustration, so the page has two coloured areas: that panel and the dark "Why not just ask your AI for a diagram?" band two sections below it. See [brand assets and color roles](branding.md).

## Structure

Activepieces sets the structure: one idea per section, the problem before the product, and one template for every section. Its logos, testimonials, result numbers and painted backgrounds are left out, because Senda has no evidence for the first three and the last would replace Ink + Teal.

Sections run in this order:

1. Hero: a centered headline, a subtitle, two buttons and one line about the Free plan.
2. The transcript-to-model illustration on the ink panel.
3. Audience: who Senda is for, as three points with no visual.
4. "Why not just ask your AI for a diagram?" (`#why-senda`): the dark band, as one paragraph that states the problem. The next three sections are the answer, so it comes before them.
5. Evidence (`#how-it-works`, `#map`): the evidence capture.
6. Questions (`#clarify`): the interview quote and the question capture.
7. Revisions and the To-be plan (`#plan`): the History panel.
8. A short cream band that sends visitors to the example before they sign up.
9. Your agent (`#your-agent`): the example conversation and the command-line link.
10. Pricing (`#pricing`): the two plan cards and the usage policy link.
11. FAQs (`#questions`).
12. A closing CTA.

The header links follow that order. The method summary link is in the footer.

Sections 3 to 7, 9 and 10 use `MarketingSection` in `src/web/components/marketing.tsx`. It takes a headline, an intro, one visual, up to three points and a dark option, and lays them out as one centered column: the headline and intro at most 720 px wide, the visual at the full container width, and the points in three columns on desktop and one on phones. Don't build a section's layout by hand. Below the `sm` breakpoint the headline, intro and points of these sections and the FAQ heading are left-aligned, because centered paragraphs are hard to read on a phone. The hero, the short band and the closing CTA stay centered at every width.

Keep to these limits when you change the page:

- **Word budget.** At most 25 words in the hero subtitle, 80 in a section outside its visual, 30 in the short band and 45 in a plan card. FAQ answers are exempt because they are collapsed. Pricing holds two cards, so its section total is higher.
- **Type floor.** Marketing text is 16 px or larger: 18 px for point titles and FAQ questions, 20 px for section intros and 22 px for the hero subtitle. 14 px is allowed only in the header, the footer, window bars and product visuals, including the hero illustration.
- **Readable captures.** A product capture shows the app's text at 12 px or more at every page width. Capture each image at the width the page shows it at instead of scaling a larger one down. `scripts/capture-marketing-previews.js` fails when a capture has smaller text.

No eyebrow labels, badges or captions that only restate what a visual shows. Call the hosted assistant "the built-in agent" and leave out its product and model names; the privacy notice names the AI provider. Privacy and pricing details belong in the FAQ and pricing section. Write copy to the voice and style rules in the writing folder of Hanif's Obsidian vault. Check each product claim against the implemented workflow before it goes on the page.

Live references were inspected and visually captured on 27 October 2026:

- [Eraser AI diagrams](https://www.eraser.io/product/ai-diagrams): clear action/outcome hierarchy, two visible entry actions and an early product illustration. We use a concrete workflow rather than its speed claims, branding or images.
- [IcePanel](https://icepanel.io/): leads with the continuing value of a shared model and uses a large product view. We borrow the idea of exploring detail from a compact overview, without copying the brand, mascot, customer marks or broader architecture/governance proposition.

Images in `public/marketing` are captures of the running application's public onboarding example. Desktop previews use SVG; phone previews use PNG so their text and the evidence sheet's controls remain correctly positioned in mobile image renderers. The evidence view shows Finance's deposit-invoice step alongside transcript quotations. The clarification view shows the first draft's question about parallel Finance/Delivery work and the join before setup. The README shows `evidence.svg` and the npm package ships it, so keep that file name.

The original transcript and clarification fixtures remain documented in `examples/complex-onboarding`. Public copy uses short process and source labels, with captions explaining what a visitor can explore. Keep it direct and affirmative. Do not add repeated fixture disclaimers, speculative limitations or implementation details to product copy. Explain relevant decisions through concrete actions. Customer results and named client integrations need supporting evidence.

The hero illustration in `src/web/components/interview-to-model.tsx` is a drawing, not a screenshot. It places Luis's Finance passage from the onboarding transcript above a simplified version of revision 5's Finance subprocess. Keep its step names and quote in line with `public/examples/onboarding-final.json`; its window bar links to the full model in the example. Its labels are 14 px. Below the `xl` breakpoint it uses a compact vertical drawing, and the whole card fits one 640 px screen on a 320 px phone. The History panel in the revisions section is also drawn in the page; its revision names follow the example. The example conversation in the agent section paraphrases the README prompt and the first draft's revision summary and first question. Transcripts don't always name speakers, so don't promise that Senda shows who said something; it shows the passage a step came from.

Name a commercial agent client on the page only after its connection flow has been tested (see [hosted compatibility](hosted.md)). Until then, describe the requirement in plain terms: a remote MCP server with OAuth sign-in. Keep the homepage pricing, provider disclosures, usage terms and FAQ consistent with the current Free and Pro plans. The homepage `#pricing` section is the pricing destination; `/pricing` redirects to it.

The worked example is publicly reachable at `/example`; the first draft is `/example?draft=true`. Private review links require account access.

## Sharp product previews

Desktop previews preserve the app's HTML text, SVG diagrams and styles inside SVG `foreignObject` elements. They contain no scripts or remote images. Media queries and viewport units are resolved at capture time so a preview scales without changing its layout. Phone previews are screenshots of the real question and the real **Step evidence** dialog at device scale 2, preserving their wrapping and the dialog's close control without relying on `foreignObject` layout. The marketing page links each preview to the corresponding live example view.

Earlier WebP assets included desktop captures enlarged from 1× images, and an earlier evidence capture was 1,200 px wide in a 728 px column, which put the app's text under 5 px. Neither enlarging nor shrinking keeps text readable. Keep desktop diagram lines and lettering as vectors, and capture every image at the width the page displays it.

| File | Shown | Size | Captured from |
| --- | --- | --- | --- |
| `evidence.svg` | 1024 px and wider | 1008 × 620 | `/example?view=FinanceWork&element=Invoice` at 1056 × 850, cropped to `.diagram-workspace` |
| `evidence-mobile.png` | 360 to 1023 px | 350 × 646 | The **Step evidence** dialog of the same view at 350 × 760 |
| `evidence-mobile-small.png` | Under 360 px | 280 × 646 | The same dialog at 280 × 760 |
| `clarification.svg` | 861 px and wider | 720 × 229 | `/example?draft=true&section=questions` at 800 × 1000, cropped to the first `.reading-column [data-slot="accordion-item"]` |
| `clarification-mobile.png` | 360 to 860 px | 334 × 341 | The same question at 390 × 844 |
| `clarification-mobile-small.png` | Under 360 px | 264 × 381 | The same question at 320 × 844 |

1. Run `npm run build`, then `npm run serve`, so the public example is at `http://127.0.0.1:3000/example`. Install the browser once with `npx playwright install chromium`.
2. Run `node scripts/capture-marketing-previews.js <capture-directory>`. It uses the read-only `capturePreview` function in [capture-preview-dom.js](../scripts/capture-preview-dom.js) for the two vector captures and saves them as `evidence-vector.json` and `clarification-vector.json`. For the evidence view it opens the evidence panel, narrows it one step, zooms the diagram to 120% so its labels are 13 px, and pans until the selected step is centered. It saves the four phone PNGs with animations disabled, after the dialog has opened. It prints each capture's size and smallest text, and stops if any text is under 12 px.
3. Run `npm run build:marketing -- <capture-directory>`. The builder validates and writes the two SVGs and copies the four PNGs into `public/marketing`. To refresh only the phone images, use `node scripts/build-marketing-previews.js <capture-directory> --mobile-only`; this needs only the PNGs and leaves the SVGs unchanged.
4. If a capture's size changed, update its `width` and `height` in `src/web/components/marketing.tsx`. Bump the version in that file's `capture` function, then check the images as embedded images at 1440, 390 and 320 px. Check that each crop is complete and that each image opens its intended example view.
