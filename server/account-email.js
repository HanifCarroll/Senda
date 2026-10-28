import { brandColors as c } from "../src/brand.js";
import { emailLogoBase64, emailLogoDarkBase64, emailLogoWidth, emailLogoHeight } from "../src/brand-assets.js";

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const copy = {
  subject: "Your Senda sign-in link",
  preview: "Sign in to your account. Your link expires in 10 minutes.",
  heading: "Sign in",
  action: "Continue to Senda",
  expiry: "This link expires in 10 minutes and can be used once.",
  reassurance: "If you didn’t ask to sign in, you can ignore this email.",
};

/** A self-contained email; its logo is an inline MIME image, with no remote fetch. */
export function accountEmail({ url, origin }) {
  const base = new URL(origin),
    destination = new URL(url);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    destination.origin !== base.origin || destination.username || destination.password
  )
    throw new Error("Invalid account email link.");
  // Keep all signed query parameters intact. Opening a sign-in email must not
  // consume its token: verification still requires the confirmation page.
  const link = new URL(`/sign-in/confirm${destination.search}`, base).href,
    actionURL = escape(link),
    home = escape(base.origin),
    newLink = new URL("/sign-in", base).href,
    recovery = `<p class="muted" style="margin:20px 0 0;font-size:14px;line-height:22px;color:${c.muted};">Link expired? <a class="secondary" href="${escape(newLink)}" style="color:${c.ink};text-decoration:underline;text-underline-offset:3px;">Request a new one</a>.</p>`;

  const text = [
    "Senda",
    copy.heading,
    `${copy.action}:\n${link}`,
    copy.expiry,
    `Link expired? Request a new one:\n${newLink}`,
    copy.reassurance,
    base.origin,
  ].filter(Boolean).join("\n\n");

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escape(copy.subject)}</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    a:focus-visible { outline: 3px solid ${c.teal}; outline-offset: 4px; }
    @media screen and (max-width: 560px) {
      .outer { padding: 28px 16px !important; }
      .content { padding: 28px 24px !important; }
      .heading { font-size: 26px !important; line-height: 34px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-background { background-color: #141414 !important; }
      .email-card { background-color: #202020 !important; border-color: #3b3b3b !important; }
      .heading { color: #f5f5f5 !important; }
      .muted { color: #b5b5b5 !important; }
      .secondary { color: ${c.lightInk} !important; }
      .action { background-color: ${c.lightInk} !important; border-color: ${c.lightInk} !important; color: ${c.ink} !important; }
      .logo-light { display: none !important; }
      .logo-dark { display: block !important; height: ${emailLogoHeight}px !important; max-height: ${emailLogoHeight}px !important; overflow: visible !important; }
    }
  </style>
</head>
<body class="email-background" style="margin:0;padding:0;width:100%;background-color:${c.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div aria-hidden="true" style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${escape(copy.preview)}</div>
  <table role="presentation" class="email-background" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.background}" style="width:100%;background-color:${c.background};border-collapse:collapse;">
    <tr><td class="outer" align="center" style="padding:48px 24px;">
      <!--[if mso]><table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:528px;border-collapse:separate;">
        <tr><td class="email-card content" bgcolor="#fdfdfd" style="padding:40px;background-color:#fdfdfd;border:1px solid #e3e3e3;border-radius:16px;">
          <table role="presentation" width="${emailLogoWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${emailLogoWidth}px;max-width:${emailLogoWidth}px;table-layout:fixed;border-collapse:collapse;">
            <tr><td width="${emailLogoWidth}" style="width:${emailLogoWidth}px;padding:0 0 24px;font-size:0;line-height:0;">
              <img src="cid:senda-logo" class="logo-light" alt="Senda" width="${emailLogoWidth}" height="${emailLogoHeight}" style="display:block;width:${emailLogoWidth}px;height:${emailLogoHeight}px;max-width:${emailLogoWidth}px;max-height:${emailLogoHeight}px;margin:0;border:0;background:transparent;color:${c.ink};font-family:Georgia,serif;font-size:20px;">
              <!--[if !mso]><!--><img src="cid:senda-logo-dark" class="logo-dark" alt="Senda" width="${emailLogoWidth}" height="${emailLogoHeight}" style="display:none;width:${emailLogoWidth}px;height:0;max-width:${emailLogoWidth}px;max-height:0;overflow:hidden;margin:0;border:0;background:transparent;mso-hide:all;"><!--<![endif]-->
            </td></tr>
          </table>
          <h1 class="heading" style="margin:0;color:${c.text};font-size:28px;line-height:36px;font-weight:650;letter-spacing:-0.6px;">${escape(copy.heading)}</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:28px 0 20px;">
              <!--[if mso]><v:roundrect href="${actionURL}" style="height:48px;v-text-anchor:middle;width:446px;" arcsize="16%" stroke="f" fillcolor="${c.ink}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escape(copy.action)}</center></v:roundrect><![endif]-->
              <!--[if !mso]><!--><a class="action" href="${actionURL}" style="display:block;background-color:${c.ink};border:1px solid ${c.ink};border-radius:8px;color:#ffffff;font-size:16px;line-height:48px;font-weight:600;text-align:center;text-decoration:none;">${escape(copy.action)}</a><!--<![endif]-->
            </td></tr>
          </table>
          <p class="muted" style="margin:0;color:${c.muted};font-size:14px;line-height:22px;">${escape(copy.expiry)}</p>
          ${recovery}
        </td></tr>
        <tr><td style="padding:24px 8px 0;">
          <p class="muted" style="margin:0 0 16px;color:${c.muted};font-size:14px;line-height:22px;">${escape(copy.reassurance)}</p>
          <p style="margin:0;font-size:13px;line-height:20px;"><a class="secondary" href="${home}" style="color:${c.muted};text-decoration:underline;text-underline-offset:3px;">${escape(base.hostname)}</a></p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: copy.subject, text, html, attachments: [{
    filename: "senda-logo.png", content: emailLogoBase64, type: "image/png",
    disposition: "inline", contentId: "senda-logo",
  }, {
    filename: "senda-logo-dark.png", content: emailLogoDarkBase64, type: "image/png",
    disposition: "inline", contentId: "senda-logo-dark",
  }] };
}
