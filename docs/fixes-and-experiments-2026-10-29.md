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
tests of those unavailable variants. The post-deployment comparison is recorded
below once the new production tool descriptors are available.

## Local verification

114 unit tests passed, including preserved authentication destinations, complete
reference/schema retrieval and owner-scoped payment-method updates. Both builds,
typecheck and the 244-file source check passed. Twelve real Cloudflare runtime/MCP
checks and the expanded browser journey passed, including actual downloaded files,
independent histories, authentication, loading/reload behavior and payment UI states.
