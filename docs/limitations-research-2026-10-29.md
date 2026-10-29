# Remaining limitations: research and verification

Research date: 29 October 2026. Sources below distinguish provider documentation,
firsthand user reports, the current implementation and observed tests.

Follow-up: the download landing page, preserved sign-in destination, actual-file
browser regressions, focused payment-method flow, smaller setup responses and
metadata-only connector diagnostics are now implemented. See the dated
[fix and experiment record](fixes-and-experiments-2026-10-29.md) for qualification
results. The recommendations below describe the earlier research baseline.

## Payment evidence

The isolated Senda sandbox completed an actual US$1 subscription Checkout with
Stripe's published test card. Its paid invoice and signed notifications granted
the test account paid access. Natural renewal, failed renewal, recovery,
period-end cancellation, expiry, partial/full refunds, dispute/fraud holds,
delayed events and replay were exercised. The paid account also completed a
five-turn modeling journey, with independently inspected saved snapshots and
BPMN exports. These were sandbox payments; no real money was charged.

Production opened the actual US$29 monthly Checkout through Senda's UI. The
session was deliberately expired unpaid. The real signed expiry notification
was recorded, without a payment intent, subscription or paid entitlement. This
verifies live wiring and the unpaid gate, rather than a successful live charge.
See [billing qualification](billing.md).

## Stripe payment-method form

The earlier blank form was an observation in the controlled browser. It did not
establish that all customers or browsers would encounter the problem.

A new isolated test on 29 October used the existing sandbox portal configuration
and a disposable customer, without enabling the QA Worker or webhook. A documented
`payment_method_update` deep link rendered in the in-app browser. The published
Visa test card was entered and submitted once. Stripe displayed confirmation;
an independent API read verified the new customer default payment method, Visa
ending 4242. Invoices, subscriptions and charges each remained at zero.

The ordinary portal was then opened in Chrome for the same customer. Its saved
card and card-entry fields rendered. An additional keyboard automation attempt
encountered stale accessibility elements as the card fields updated; no second
submission was made. Thus the
completed card save is verified in the in-app browser, and normal Chrome form
rendering is verified separately. The earlier blank state did not reproduce.
The disposable customer was removed and temporary portal addresses invalidated.
No production configuration was changed.

Stripe's [portal deep-link documentation](https://docs.stripe.com/customer-management/portal-deep-links)
provides a focused payment-method flow. An explicit Update payment method button
would be a useful usability improvement; this is not evidence that the general
portal is defective. Both entry points use Stripe's hosted form.

One recovery detail needs explicit coverage in any implementation change:
[Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
prioritizes subscription payment-method overrides over the customer's default.
Changing only the customer default can leave retries using the old subscription
card. Qualify a past-due account with an override before claiming that a new
button fixes payment recovery. Stripe's
[portal integration guide](https://docs.stripe.com/customer-management/integrate-customer-portal)
also describes customer updates and removal of subscription overrides.

Do not diagnose the blank form from a cookie warning alone. Stripe explicitly
documents its ordinary
[third-party-cookie warnings as harmless](https://support.stripe.com/questions/chrome-third-party-cookie-warnings-for-websites-using-stripe-js).
If a blank form recurs, compare fresh sessions, browsers and networks, and collect
sanitized console and request-status evidence. Senda redirects to Stripe at the
top level; weakening Senda's CSP is not a justified fix for a Stripe-hosted page.

## Downloads: a verified implementation edge case

The MCP `export_bpmn` result currently includes a `browserDownload` URL pointing
directly to the private BPMN API endpoint. A fresh unauthenticated production
request returned HTTP 401 with `UNAUTHENTICATED` and no redirect. Current project
sign-in handling also drops the requested project/model/revision destination.
This is a concrete usability gap when the link opens in a browser that is not
already signed in to Senda. It does not explain every automation timeout.

Recommended change: provide a sign-in-aware download landing page, preserve a
validated project/model/revision destination through authentication, and check
ownership before offering the exact saved revision. Point the connector's
browser-facing export link at that page. Keep the authenticated API attachment
for clients and for the signed-in download button. Do not make private diagrams
public or put credentials in links.

The [HTML download attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download)
has origin and browser-dependent behavior. Senda's signed-in download uses a
same-origin link with an attachment response; the HTTP export and diagram
semantics have already been independently verified.

## Downloads: automation coverage

The current browser regression script does not wait for a browser download
event or inspect the resulting downloaded file. Its other browser checks passing
does not close this coverage gap. Independent authenticated HTTP checks and
earlier consumer file checks remain separate evidence.

[Playwright's download guide](https://playwright.dev/docs/downloads) specifies
starting the download wait before clicking and persisting the completed file
before closing its browser context. Add real browser checks for complete BPMN,
scoped BPMN and SVG, then inspect the saved files, selected revision and geometry.
Include the signed-out sign-in path and mobile layouts.

Prefer the existing directly launched Playwright test browser for this owned-app
regression. Playwright documents existing-browser
[CDP connections as lower fidelity](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp).
Chrome's [download protocol](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-setDownloadBehavior)
also distinguishes download behavior from its optional progress events. A managed
browser observer timing out is not sufficient evidence of corrupt BPMN. Keep
actual user-browser interaction tests alongside the automated file assertions.

The documented order was also tested during this research in a fresh in-app
browser. The production example's actual downloaded BPMN was 47,770 bytes,
matched the published export exactly, and parsed with zero warnings, six
diagrams and 122 diagram elements. A fresh ordinary email sign-in then allowed
three authenticated production downloads through the saved project's actual UI:

| Model and revision | Downloaded bytes | Diagram elements | Parse warnings |
| --- | ---: | ---: | ---: |
| As-is revision 7 | 19,769 | 44 | 0 |
| To-be revision 4 | 22,491 | 49 | 0 |
| To-be revision 7 | 24,753 | 53 | 0 |

Each private file matched the process semantics of its independently retained
saved snapshot. These are real browser-downloaded files, extending the earlier
HTTP-only evidence. No provider inference call was made. The temporary browser
session was signed out. The successful fresh-browser procedure does not identify
the earlier Chrome observer's cause, qualify downloads inside the ChatGPT
consumer UI, or fix the signed-out export-link behavior. Promote these file
assertions into the regular browser regression suite.

## ChatGPT response-display failure

Sources and revisions saved during the earlier realistic ChatGPT journey, while
some replies displayed “This response couldn't load.” Later replies rendered.
That is a real user-facing failure whose cause remains unconfirmed.

The current server returns ordinary MCP text content containing serialized JSON.
This is permitted by the
[MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
It does not currently declare an output schema or return structured content, so
there is no demonstrated schema mismatch to fix. Senda also has no embedded
ChatGPT widget; widget CSP advice does not explain its plain tool replies.

[OpenAI's MCP guidance](https://developers.openai.com/plugins/concepts/mcp-server)
recommends concise results. Local measurement found 65,638 bytes in the nine-file
discovery-method response and 48,147 bytes in the model-schema response. These
are optimization candidates, not a documented size-limit violation or a proven
cause of the display failure. No authoritative universal ChatGPT tool-result
byte threshold was established by this research.

Recommended experiment: compare a minimal read-only tool response with the
current responses in fresh ChatGPT conversations, across browser/model choices.
Then test on-demand method references and narrower schema retrieval. If adopting
structured results, provide exact output schemas as described in
[OpenAI's reference](https://developers.openai.com/plugins/reference), with
compatible text content and actual consumer regression coverage.

A [dated firsthand report](https://community.openai.com/t/several-bugs-after-recent-updates-response-couldnt-load-prompt-version-switching-missing-scroll-lock-temporary-chat/1403908/1)
describes the same visible error outside Senda. It is corroboration of the symptom,
not a vendor-confirmed diagnosis or evidence that Senda cannot contribute.
[OpenAI's troubleshooting guide](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages)
recommends controlled browser/network comparisons and diagnostics for unresolved
cases. The public status page reported operational when checked; aggregate status
cannot exclude a particular account or client failure.

For mutating tools, inspect saved state before repeating a request. Existing
revision preconditions prevent stale updates; blindly repeating project creation
can still create a duplicate. Keep clear saved-revision receipts and Senda's
review links. Capture model, client version, timestamps, tool names, result sizes,
request IDs and sanitized errors for a support report. Do not send raw HAR files
or credentials, and do not submit a support message without authorization.

## API credit benefit

[OpenAI's current credit guide](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
requires a paid eligible Pro/Business subscription at least seven days old,
matching ChatGPT/API email, and ownership of both the subscription/workspace and
receiving API organization. Claim from the documented Billing benefit flow.
The amount depends on the subscription; US$500 is an upper bound.

The previous account check returned `program_unavailable` and no grant. That
observation does not establish permanent ineligibility. Recheck the documented
flow and ownership/email conditions; escalate an unexplained refusal to OpenAI.
GPT-6.1 Sol model access is a separate question and was previously verified in
the organization. This research did not create a key, purchase credits, enable
automatic recharge, change the Senda provider or recheck the account's benefit UI.

## Proposed order

1. Fix the confirmed signed-out download destination and add real file-download
   browser assertions.
2. Add a focused card-update entry point if useful, qualifying subscription
   overrides and failed-payment recovery. The hosted card form itself now has a
   successful fresh sandbox test.
3. Run the controlled ChatGPT result-size and client comparisons. Keep beta
   labeling until the actual user journey is reliable.

Application behavior and billing configuration are unchanged. These
recommendations have not been implemented as application changes by this
research task.
