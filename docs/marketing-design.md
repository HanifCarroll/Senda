# Public page and screenshot provenance

The public Senda page uses the shared Ink + Teal identity over a neutral shadcn foundation, with sans-serif interface text and an outlined serif wordmark. Its sequence is an outcome-led heading, a real evidence-view screenshot, a transcript gap becoming a clarification, a revised process, three practical benefits, an own-agent workflow, factual FAQs and a working project CTA. See [brand assets and color roles](branding.md).

Live references were inspected and visually captured on 27 October 2026:

- [Eraser AI diagrams](https://www.eraser.io/product/ai-diagrams): clear action/outcome hierarchy, two visible entry actions and an early product illustration. We use a concrete workflow rather than its speed claims, branding or images.
- [IcePanel](https://icepanel.io/): leads with the continuing value of a shared model and uses a large product view. We borrow the idea of exploring detail from a compact overview, without copying the brand, mascot, customer marks or broader architecture/governance proposition.

Images in `public/marketing` are SVG captures of the running application's public onboarding example. The evidence view shows Finance's deposit-invoice step alongside transcript quotations. The clarification view shows the first draft's question about parallel Finance/Delivery work and the join before setup. The overview shows the revised process.

The original transcript and clarification fixtures remain documented in `examples/complex-onboarding`. Public copy uses short process and source labels, with captions explaining what a visitor can explore. Keep it direct and affirmative. Do not add repeated fixture disclaimers, speculative limitations or implementation details to product copy. Explain relevant decisions through concrete actions. Customer results and named client integrations need supporting evidence.

The worked example is publicly reachable at `/example`; the first draft is `/example?draft=true`. Private review links require account access.

## Sharp product previews

The previews preserve the app's HTML text, SVG diagrams and styles inside SVG `foreignObject` elements. They contain no scripts or remote images. Media queries and viewport units are resolved at capture time so a preview scales without changing its layout. The marketing page links each preview to the corresponding live example view.

Earlier WebP assets included desktop captures enlarged from 1× images. Enlarging an image does not recover text detail. Use the vector capture pipeline when updating the previews; keep diagram lines and lettering as vectors.

1. Build and open the local app's public `/example` route in the browser.
2. Use the read-only `capturePreview` function in [capture-preview-dom.js](../scripts/capture-preview-dom.js) with the browser's evaluate API, saving its returned JSON outside the checkout. Capture evidence and overview at 1200 × 800; clarification at 600 × 1000, cropped to `.reading-column [data-slot="accordion-item"]`; and mobile evidence at 390 × 844, cropped to `[role="dialog"]`.
3. Save the four results as `evidence-vector.json`, `overview-vector.json`, `clarification-vector.json` and `evidence-mobile-vector.json` in one directory. Open the evidence panel and fit each diagram before capturing it.
4. Run `npm run build:marketing -- <capture-directory>`. The builder validates that captures come from the public example, embeds the mark, freezes the layout and writes the four SVGs.
5. Update the preview URL version in `web/components/marketing.tsx`, then visually check the images as embedded images on desktop and mobile. Check that the mobile evidence crop is complete and that each image opens its intended example view.
