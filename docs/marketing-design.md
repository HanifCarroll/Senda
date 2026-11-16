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
5. Evidence (`#how-it-works`, `#map`): the live example, a link to the full example, and the point about BPMN downloads.
6. Questions (`#clarify`): the interview quote between two lines that say what it left unclear, and the question capture.
7. Revisions and the To-be plan (`#plan`): the History panel.
8. A short cream band that sends visitors to the example before they sign up.
9. Your agent (`#your-agent`): the built-in agent and a connected Claude or ChatGPT, with the example conversation and the command-line link.
10. Pricing (`#pricing`): the two plan cards and the usage policy link.
11. FAQs (`#questions`).
12. A closing CTA.

The header links follow that order. The method summary link is in the footer.

Sections 3 to 7, 9 and 10 use `MarketingSection` in `src/web/components/marketing.tsx`. It takes a headline, an intro, one visual, up to three points, a dark option and a layout. Don't build a section's layout by hand. From the `lg` breakpoint up, text and visuals sit side by side, so the page is shorter without smaller type or tighter padding:

- `visual-right` and `visual-left` put the headline, the intro and the points in one column and the visual in the other, centered against the text. Sections with a compact visual use them and alternate down the page: questions has its visual on the right, revisions on the left, and the agent section on the right.
- `wide` puts the headline on the left and the intro on the right, above a visual or content at the full container width. Evidence uses it, because the diagram and its panel need the room, and so does pricing, for its two cards.
- `centered` is one centered column, the headline and intro at most 720 px wide. The audience section and the dark band use it.

The FAQ puts its heading on the left and the questions on the right. Below `lg` every section is the centered column, with the visual at the full container width and the points in three columns from `md` and one on phones. Below the `sm` breakpoint the headline, intro and points of these sections and the FAQ heading are left-aligned, because centered paragraphs are hard to read on a phone. The hero, the short band and the closing CTA stay centered at every width.

A visual beside the text is about 430 px wide inside its cream panel at 1440 px, and about 370 px at 1024 px, so it has to read at phone width: the History panel stacks its two tracks, and the question shows its phone capture.

Keep to these limits when you change the page:

- **Word budget.** About 25 words in the hero subtitle (it is 26 now), 80 in a section outside its visual, 30 in the short band and 45 in a plan card. FAQ answers are exempt because they are collapsed. Pricing holds two cards, so its section total is higher. Three sections are over 80 and shouldn't grow: the agent section is 92 words, because it explains both agents and carries the ChatGPT plan restriction; the questions section is 86 outside its panel, which holds another 29 in the quote and the two lines around it; and the revisions section is 84.
- **Type floor.** Marketing text is 16 px or larger: 18 px for point titles and FAQ questions, 20 px for section intros and 22 px for the hero subtitle. 14 px is allowed only in the header, the footer, window bars and product visuals, including the hero illustration.
- **Readable captures.** A product capture shows the app's text at 12 px at 1440, 390 and 320 px, the widths it is captured for, and never under about 10.5 px in between. The page scales a capture down a little between those widths: at 1024 px the evidence capture is drawn 960 px wide, so its text is 10.6 px, and at 360 px the phone captures show their text at 11 px. Capture each image at the width the page shows it at instead of scaling a larger one down. `scripts/capture-marketing-previews.js` fails when a capture's own text is under 12 px.
- **The live example isn't scaled.** The evidence section's example is the app itself, so its text is the app's real size at every width, 12 px or larger.

- **One name for each thing.** A newcomer takes each new word for a new thing, so the page body uses one name each:
  - "AI agent" once, in the hero subtitle, and "the agent" after it. "The built-in agent" is Senda's own, and "your own agent" or "your own Claude or ChatGPT" is a connected one. Don't write "an agent", "your AI" or "assistant" for it. The one exception is "a chat assistant" in the dark band, which means an AI chat used without Senda.
  - "Diagram" for what the agent draws, until the revisions section introduces "As-is" and "To-be". After that, "As-is diagram" and "To-be plan". Don't write "model".
  - "Passage" for the transcript text a step came from. Don't write "source".
  - "Revision" for a saved version of a diagram.
  - "Saved projects" for the plan limits, which is the app's own wording.
  - "Senda Pro" wherever ChatGPT's Pro plan is mentioned nearby.

  FAQ answers can keep "sources" and "models" where the answer is about them, as the privacy answer does. Product captures show the real app, so they keep the app's words.

No eyebrow labels, badges or captions that only restate what a visual shows. Call the hosted assistant "the built-in agent" and leave out its product and model names; the privacy notice names the AI provider. Privacy and pricing details belong in the FAQ and pricing section. Write copy to the voice and style rules in the writing folder of Hanif's Obsidian vault. Check each product claim against the implemented workflow before it goes on the page.

Live references were inspected and visually captured on 27 October 2026:

- [Eraser AI diagrams](https://www.eraser.io/product/ai-diagrams): clear action/outcome hierarchy, two visible entry actions and an early product illustration. We use a concrete workflow rather than its speed claims, branding or images.
- [IcePanel](https://icepanel.io/): leads with the continuing value of a shared model and uses a large product view. We borrow the idea of exploring detail from a compact overview, without copying the brand, mascot, customer marks or broader architecture/governance proposition.

## The live example

The evidence section embeds the public example instead of a picture of it, so a visitor can select a step and read its evidence without leaving the page. `EvidenceDemo` in `src/web/components/evidence-demo.tsx` shows the first draft's main view in the app's own `DiagramCanvas` and `EvidencePanel`, with "Check handover pack" selected. The first draft's main view is the one view where five steps have different passages from the interview itself, and the questions section under it shows the same draft's question. The diagram opens at 110%, so its labels are 12 px, from the view's top left corner. From 1024 px up every step is in view. On a phone the diagram is wider than the screen, so it starts at its left edge with the selected step in view.

- **Nothing navigates.** The selection is local state, so the URL never changes. A passage's source opens in a sheet over the page. The plain "Open the full example" link under it goes to `/example?draft=true` and is the only way out.
- **No dead buttons.** The demo shows one view, so a subprocess is a step with evidence and has no "Explore this part" button. A step's related questions are shown as text, because the demo has no question list to open. In the app both are still buttons.
- **It loads late, and nothing moves when it does.** The page first shows a capture of the demo itself, in the same box. The demo's code (about 2 kB) and `public/examples/onboarding-draft.json` (119 kB, 16 kB compressed) load when the section comes within 800 px of the viewport. If either fails, the capture stays. From 1024 px up the box is the cream panel, 836 px tall. Below that the demo takes the capture's exact height, and the diagram absorbs any difference, until the visitor selects a step or resizes the window.
- **It doesn't trap the page's scroll.** A wheel or trackpad scroll over the diagram scrolls the page; only a pinch or Ctrl and the wheel zooms. On a touch screen a swipe up or down scrolls the page (`touch-action: pan-y` on `.evidence-demo .diagram-stage`), and a sideways drag pans the diagram. Drag, the zoom buttons and Fit work as in the app.
- **Phones** show the diagram 610 px tall, which holds every step at 110%, with the evidence panel under it at its full height, so the panel never scrolls inside the page. Together they are 1,478 px tall at 390 px and 1,564 px at 320 px.

`scripts/test-cloudflare-browser.js` selects a step in it and checks that the panel shows another passage, the URL doesn't change, and the wheel scrolls the page. At 1440, 390 and 320 px it holds the data request back and checks that the section's height and the next section's top don't move when the demo appears, then fails the request and checks that the capture stays.

## Captures

Images in `public/marketing` are captures of the running application's public onboarding example. Desktop previews use SVG; phone previews use PNG so their text and controls remain correctly positioned in mobile image renderers. The three evidence captures are pictures of the home page's live example in its first state, and the evidence section shows them until the example loads. They show the coordinator's "Check handover pack" step in the first draft, alongside her own words from the interview. Pick a step whose evidence is the interview transcript, not an answer to a clarification question, because answers in the example are written as summaries. The clarification view shows the first draft's question about whether Finance and Delivery start together, with its reason, cropped above the two step buttons under it, which look like answer choices out of context. The README shows `evidence.svg` and the npm package ships it, so keep that file name.

The original transcript and clarification fixtures remain documented in `examples/complex-onboarding`. Public copy uses short process and source labels, with captions explaining what a visitor can explore. Keep it direct and affirmative. Do not add repeated fixture disclaimers, speculative limitations or implementation details to product copy. Explain relevant decisions through concrete actions. Customer results and named client integrations need supporting evidence.

The hero illustration in `src/web/components/interview-to-model.tsx` is a drawing, not a screenshot. It places Luis's Finance passage from the onboarding transcript above a simplified version of revision 5's Finance subprocess. "No approved terms" sits on the arrow into step 1 in the wide drawing, so that arrow is 152 units long to hold the label in wider fonts. Keep its step names and quote in line with `public/examples/onboarding-final.json`; its window bar links to the full model in the example. Its labels are 14 px. Below the `xl` breakpoint it uses a compact vertical drawing, and the whole card fits one 640 px screen on a 320 px phone. `scripts/test-cloudflare-browser.js` checks that its labels clear the task borders, badges and connectors, in CI's wider Linux font. The History panel in the revisions section is also drawn in the page; its revision names follow the example. A To-be plan starts as a copy of the chosen As-is revision and is redrawn from the design brief afterwards (`skills/senda/references/planning.md`), so To-be 1 is the copy. The example conversation in the agent section paraphrases the README prompt and the first draft's revision summary and first question. Transcripts don't always name speakers, so don't promise that Senda shows who said something; it shows the passage a step came from.

Name a commercial agent client on the page only after its connection flow has been tested (see [hosted compatibility](hosted.md)). Until then, describe the requirement in plain terms: a remote MCP server with OAuth sign-in. Keep the homepage pricing, provider disclosures, usage terms and FAQ consistent with the current Free and Pro plans. The homepage `#pricing` section is the pricing destination; `/pricing` redirects to it.

The worked example is publicly reachable at `/example`; the first draft is `/example?draft=true`. Private review links require account access.

## Sharp product previews

Desktop previews preserve the app's HTML text, SVG diagrams and styles inside SVG `foreignObject` elements. They contain no scripts or remote images. Media queries and viewport units are resolved at capture time so a preview scales without changing its layout. Phone previews are screenshots of the real question and the home page's live example at device scale 2, preserving their wrapping without relying on `foreignObject` layout. The question preview links to its view of the example.

Earlier WebP assets included desktop captures enlarged from 1× images, and an earlier evidence capture was 1,200 px wide in a 728 px column, which put the app's text under 5 px. Neither enlarging nor shrinking keeps text readable. Keep desktop diagram lines and lettering as vectors, and capture every image at the width the page displays it.

| File | Shown | Size | Captured from |
| --- | --- | --- | --- |
| `evidence.svg` | 1024 px and wider, until the live example loads | 1088 × 836 | The evidence section's cream panel on `/` at 1440 × 1100, with the example loaded |
| `evidence-mobile.png` | 360 to 1023 px, until the live example loads | 350 × 1478 | The loaded example on `/` at 390 × 844 |
| `evidence-mobile-small.png` | Under 360 px, until the live example loads | 280 × 1564 | The loaded example on `/` at 320 × 844 |
| `clarification.svg` | 861 to 1023 px | 720 × 106 | `/example?draft=true&section=questions` at 800 × 1000, cropped to the first `.reading-column [data-slot="accordion-item"]` and cut 16 px under its reason |
| `clarification-mobile.png` | 360 to 860 px, and 1024 px and wider, where the question sits beside the text | 334 × 146 | The same question at 390 × 844 |
| `clarification-mobile-small.png` | Under 360 px | 264 × 186 | The same question at 320 × 844 |

1. If the example's data changed, first run `node scripts/build-public-example.js`; it rewrites `public/examples/onboarding-draft.json` and `onboarding-final.json` from `examples/complex-onboarding/proposals.js`. Then run `npm run build`, then `npm run serve`, so the home page and the public example are at `http://127.0.0.1:3000`. Install the browser once with `npx playwright install chromium`.
2. Run `node scripts/capture-marketing-previews.js <capture-directory>`. It uses the read-only `capturePreview` function in [capture-preview-dom.js](../scripts/capture-preview-dom.js) for the two vector captures and saves them as `evidence-vector.json` and `clarification-vector.json`. For the evidence captures it opens `/`, scrolls to the evidence section and waits for the live example. The page holds the example to the old capture's height on a phone, so the script changes the viewport's width and changes it back to let it take its own height. It stops if the example doesn't open on "Check handover pack", if the selected step is cut by the diagram's edge (on desktop, if any step is), or if the interviewee's passage isn't visible in the panel. The vector capture removes the rest of the home page first, so the image holds only the panel. For the question it cuts the crop 16 px under the reason. It saves the four phone PNGs with animations disabled. It prints each capture's size and smallest text, and stops if any text is under 12 px.
3. Run `npm run build:marketing -- <capture-directory>`. The builder validates and writes the two SVGs and copies the four PNGs into `public/marketing`. To refresh only the phone images, use `node scripts/build-marketing-previews.js <capture-directory> --mobile-only`; this needs only the PNGs and leaves the SVGs unchanged.
4. If a capture's size changed, update its `width` and `height` in `src/web/components/marketing.tsx`, and for the desktop evidence capture the two heights beside it (`lg:h-[836px]` and the example's `lg:h-[756px]`, which is 80 px less for the panel's padding). Bump the version in that file's `capture` function, then check the images as embedded images at 1440, 390 and 320 px. Check that each crop is complete and that the question image opens its example view. If the example's first state changed, capture twice: the first run records its new height, and the second is taken with nothing held.
