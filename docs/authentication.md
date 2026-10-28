# Account sign-in and agent access

Production uses Better Auth on Cloudflare Workers. Account ownership, agent
permissions and model-provider plan usage are separate concerns.

## Email links

Enter an email on `/sign-in`. A link expires after ten minutes and is stored
hashed in D1. Opening the link displays a confirmation page; it does not redeem
the token. Pressing Continue performs verification and creates a session. Tokens
are consumed atomically, so a replay cannot create another session. The same
email resolves to the same existing user and private projects. New users are
created with verified email ownership.

Password sign-in is disabled in production. The separate local Node app keeps
its password fallback because no local email transport is configured. Existing
session, ownership, consent and revocation checks remain in the shared handler.
Email messages go through the sender-restricted Cloudflare Email Service binding.

### Email copy and design

The [sign-in template](../server/account-email.js) is the only account email. Keep the subject specific, the heading short, the main action prominent,
the expiry near the button, and the unsolicited-message note in the footer.
Sign-in messages also offer a link to request a replacement. The confirmation
page explains its own action; email copy does not narrate the clicks ahead.

The template uses the app's Ink + Teal colors, an outlined logo embedded as an
inline PNG attachment, system fonts and a single-column layout. Essential styles are inline, with responsive spacing and
explicit dark colors for supporting clients. It includes a plain-text version
and an Outlook button fallback. No remote images, fonts or tracking resources
are loaded. Email clients can still override colors; browser previews are not
proof of rendering in every version of Mail, Gmail or Outlook.

Run `npm run preview:emails` to generate HTML and text examples in the ignored
`output/account-emails` folder, or pass an output directory after `--`. Preview
links use a reserved example domain and cannot sign anyone in. Real signed
queries must remain intact and sign-in links must keep the scanner-safe
confirmation route. Tests cover both the normal and Outlook destinations.

Implementation references: [Gmail CSS support](https://developers.google.com/workspace/gmail/design/css),
[Litmus email buttons](https://www.litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design),
and [Microsoft's light and dark email guidance](https://learn.microsoft.com/en-us/dynamics365/customer-insights/journeys/email-dark-mode).

## Google setup

Create a dedicated OAuth client for Senda in [Google Cloud Console](https://console.cloud.google.com/auth/clients).
Choose **Web application** and register this exact redirect URI:

```text
https://senda.hanifcarroll.com/api/auth/callback/google
```

Use the basic identity scopes only: OpenID, email and profile. No Drive or Gmail
access is requested. Better Auth requires verified email before issuing a Google
session and uses its normal verified-email account-linking rules.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Workers secrets. An ignored,
owner-only template is prepared at `.process-scribe/google-oauth.json`. Fill it
privately, then apply it with `npx wrangler secret bulk <private-file.json>`.
Never commit a downloaded Google credential file or paste its secret into chat.
The Google button appears only when both values are configured. The production
client lives in the dedicated Google Cloud project `senda-513001`; its credentials
are stored as Workers secrets. Its audience is External and its publishing status
is In production. Its home page is the app root and its privacy page is `/privacy`,
linked from both the home page and sign-in screen. No sensitive or restricted
Google scopes are requested.

Local browser tests use dummy credentials and verify the OAuth start and callback
URI. Production sign-in has also been exercised with a real Google account,
including the verified email and basic identity scopes. Console publishing and
brand verification are separate from a successful sign-in; check the Google
project's Audience and Branding screens when changing public availability.

## Agent connections

CIMD identifies an agent through its public metadata URL. The Worker transport
requires Cloudflare's `global_fetch_strictly_public` network boundary and refuses
redirects or inbound credentials. Better Auth verifies metadata and redirect
URIs. Dynamic registration remains available. Neither method grants a private
project until the signed-in owner approves its consent screen.

An agent connecting to Senda is distinct from Senda signing in to a model
provider. Senda currently makes no inference requests itself.

Primary implementation references: [Better Auth magic links](https://better-auth.com/docs/plugins/magic-link),
[Google sign-in](https://better-auth.com/docs/authentication/google),
[account linking](https://better-auth.com/docs/concepts/users-accounts),
and [Cloudflare's CIMD transport boundary](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md#client-id-metadata-documents).
