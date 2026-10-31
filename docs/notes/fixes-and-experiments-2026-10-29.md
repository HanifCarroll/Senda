# Fixes and experiments, 29 October 2026

## Saved exports and authentication

Connector exports now link to an authenticated download page for the exact
project, model and saved revision. Sign-in, retry and incomplete-link recovery
preserve this validated destination. External return URLs are rejected.
Ownership and revision existence are checked before displaying the download.
Opening or reloading the page does not automatically download anything.

The permanent real-Worker browser suite saves three complete BPMN files, a scoped
BPMN file, an SVG and a historical To-be file after signing in on a fresh mobile
session. It checks model/revision semantics, BPMN parsing and diagram geometry,
invalid revisions, private-project isolation and absence of unsolicited downloads.
All six file checks passed. A separate manual browser visit also downloaded the
selected historical To-be revision. Desktop and mobile layouts were inspected.

## Card updates and failed-payment recovery

Your plan now offers a focused Update payment method action alongside Manage
subscription. The server selects the authenticated owner's Stripe customer,
configured account and portal configuration. Browser-supplied customer IDs or
return addresses are not accepted. The action does not grant paid entitlement.

An isolated sandbox customer had a real failed US$1 trial-end invoice and a
declining subscription card override. Senda showed the signed past-due state.
The new button opened Stripe's hosted form; saving the published Visa test card
set the customer default and cleared the old subscription override. The invoice
remained open, correctly. Manage subscription → Pay failed amount → the saved
card settled it, and canonical Stripe state became paid/active. Senda then showed
the recovered subscription. Its instructions explicitly distinguish saving a
card from settling the outstanding invoice. No real money was charged.

A second check set a modern `subscription.default_payment_method` override,
then saved a different published test card through the same Senda button.
Stripe cleared that override too, selected the new customer default and retained
the already-paid subscription. Both legacy source and modern payment-method
overrides were verified through canonical provider reads.

## Connected-agent setup

The default discovery response is 10,155 JSON bytes, compared with 66,280 for the
complete current bundle. The default proposal schema and operation index are
11,853 bytes, compared with the previous 48,147-byte complete schema. These sizes
exclude MCP envelopes and duplicated compatibility text.

Every installed reference remains available by name or through `reference=all`.
Every operation schema includes its transitive referenced definitions; the full
installed contract remains available through `section=full`. The two setup tools
advertise strict output schemas and return matching structured content plus
compatible text. Saved-state reads avoid repeating the installed schema. The
built-in DeepSeek agent retains its complete internal operation contract.

Mutation replies include the saved project/model/revision receipt. Connector
diagnostics record a call ID, tool name, duration, result size and error flag.
They do not log arguments, transcripts, identities or credentials. Clients should
read saved state before repeating an interrupted write; creation is not idempotent.

## Consumer comparison

Before these changes, fresh Chrome conversations using GPT-5.6 Sol Medium both
displayed their replies: a tiny project-list control (16 seconds) and the full
old discovery/schema setup (12 seconds). The latter's visible activity confirmed
both setup reads. Neither reproduced the earlier response-display failure.

GPT-6 was unavailable in the model picker because the account had reached its
usage limit. The in-app ChatGPT page returned Bad Request after its automatic
Cloudflare check. No challenge bypass, extra usage or credit purchase was used.
These conditions limit a comparison; they are not Senda failures or successful
tests of those unavailable variants. A single later retry of ChatGPT in the
in-app browser crashed the page, so that client condition remains unqualified.

After production deployment and Refresh tools in ChatGPT, fresh Chrome
GPT-5.6 Sol Medium conversations displayed both the compact setup (27 seconds)
and the explicit full fallback (15 seconds). Visible activity confirmed the
discovery/schema reads; both replies remained readable after reload. These
single observations do not establish a latency improvement, a payload threshold
or a fix for the earlier ChatGPT display error, since the baseline also passed.

The compact conversation then received a small fictional business interview,
without tool names or operation arguments. It created Moss & Co's current-process
project, saved the diagram at revision 2 and asked four useful clarification
questions. ChatGPT requested approval for the model save; Allow once completed
the authorized test. Its final reply displayed normally. An independent Senda
browser visit verified the diagram, saved source and four questions. The actual
browser-downloaded BPMN parsed without warnings, and the immutable R2 snapshot's
digest matched its D1 revision record. Exported semantics matched that snapshot,
and ten evidence quotations matched their original source segments. This is a focused regression test, separate
from the earlier complete current/future-model qualification journeys.

## Local verification

114 unit tests passed, including preserved authentication destinations, complete
reference/schema retrieval and owner-scoped payment-method updates. Both builds,
typecheck and the 244-file source check passed. Twelve real Cloudflare runtime/MCP
checks and the expanded browser journey passed, including actual downloaded files,
independent histories, authentication, loading/reload behavior and payment UI states.

## Production verification

The functional change was pushed to main as `1e75e98`. GitHub Verify run
`40875948438` succeeded. Cloudflare's automatic build `5f72dd36` showed the same
commit and successful build/deploy stages, with no migrations pending. Worker
version `9f685a2c-df13-4233-81a1-3c9e1fb67d12` served 100% of production traffic.
All nine migrations were present and no built-in provider runs were active.

Fresh production sign-in reached the exact Willow To-be revision 4 download.
Its actual browser file was 22,491 bytes, parsed without warnings and was
byte-for-byte identical to the previously independently verified saved revision.
Public health, pricing, terms and the new landing page returned HTTP 200.

The disposable sandbox subscription was canceled and its customer deleted.
The sandbox webhook and public QA endpoint were disabled again; private test
records were retained. Production purchases remain enabled. No real test charges,
extra Claude usage or changes to production billing permissions were made.
