const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const messages = {
  magic: {
    subject: "Your Senda sign-in link",
    preview: "Sign in to your account. Your link expires in 10 minutes.",
    heading: "Sign in to Senda",
    introduction: "Your sign-in link is ready.",
    action: "Sign in to Senda",
    expiry: "This link expires in 10 minutes and can be used once.",
    reassurance: "If you didn’t ask to sign in, you can ignore this email.",
  },
  verify: {
    subject: "Confirm your Senda email address",
    preview: "Confirm your email to finish setting up your account.",
    heading: "Confirm your email",
    introduction: "Confirm this email address to finish setting up your Senda account.",
    action: "Confirm email address",
    expiry: "This link expires in one hour.",
    reassurance: "If you didn’t create a Senda account, you can ignore this email.",
  },
  reset: {
    subject: "Reset your Senda password",
    preview: "Choose a new password. Your link expires in 30 minutes.",
    heading: "Reset your password",
    introduction: "Choose a new password for your Senda account.",
    action: "Choose a new password",
    expiry: "This link expires in 30 minutes.",
    reassurance:
      "If you didn’t ask to reset your password, you can ignore this email. Your password will stay the same.",
  },
};

/** A shared, self-contained email document. Never load fonts, images or tracking pixels. */
export function accountEmail({ kind, url, origin }) {
  const copy = Object.hasOwn(messages, kind) ? messages[kind] : null;
  if (!copy) throw new Error("Unknown account email type.");
  const base = new URL(origin),
    destination = new URL(url);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    destination.origin !== base.origin || destination.username || destination.password
  )
    throw new Error("Invalid account email link.");
  // Keep all signed query parameters intact. Opening a sign-in email must not
  // consume its token: verification still requires the confirmation page.
  const link = kind === "magic"
      ? new URL(`/sign-in/confirm${destination.search}`, base).href
      : url,
    actionURL = escape(link),
    home = escape(base.origin),
    newLink = new URL("/sign-in", base).href,
    recovery = kind === "magic"
      ? `<p class="muted" style="margin:20px 0 0;font-size:14px;line-height:22px;color:#666666;">Link expired? <a class="secondary" href="${escape(newLink)}" style="color:#404040;text-decoration:underline;text-underline-offset:3px;">Request a new one</a>.</p>`
      : "";

  const text = [
    "Senda",
    copy.heading,
    copy.introduction,
    `${copy.action}:\n${link}`,
    copy.expiry,
    ...(kind === "magic" ? [`Link expired? Request a new one:\n${newLink}`] : []),
    copy.reassurance,
    base.origin,
  ].join("\n\n");

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
    a:focus-visible { outline: 3px solid #737373; outline-offset: 4px; }
    @media screen and (max-width: 560px) {
      .outer { padding: 28px 16px !important; }
      .content { padding: 28px 24px !important; }
      .heading { font-size: 26px !important; line-height: 34px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-background { background-color: #141414 !important; }
      .email-card { background-color: #202020 !important; border-color: #3b3b3b !important; }
      .heading, .wordmark { color: #f5f5f5 !important; }
      .body-copy { color: #d4d4d4 !important; }
      .muted { color: #b5b5b5 !important; }
      .secondary { color: #d4d4d4 !important; }
      .action { background-color: #eeeeee !important; border-color: #eeeeee !important; color: #1c1c1c !important; }
    }
  </style>
</head>
<body class="email-background" style="margin:0;padding:0;width:100%;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div aria-hidden="true" style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${escape(copy.preview)}</div>
  <table role="presentation" class="email-background" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5" style="width:100%;background-color:#f5f5f5;border-collapse:collapse;">
    <tr><td class="outer" align="center" style="padding:48px 24px;">
      <!--[if mso]><table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:528px;border-collapse:separate;">
        <tr><td class="email-card content" bgcolor="#fdfdfd" style="padding:40px;background-color:#fdfdfd;border:1px solid #e3e3e3;border-radius:16px;">
          <p class="wordmark" style="margin:0 0 32px;color:#222222;font-size:21px;line-height:28px;font-weight:700;letter-spacing:-0.5px;">Senda</p>
          <h1 class="heading" style="margin:0 0 12px;color:#222222;font-size:28px;line-height:36px;font-weight:650;letter-spacing:-0.6px;">${escape(copy.heading)}</h1>
          <p class="body-copy" style="margin:0;color:#525252;font-size:16px;line-height:26px;">${escape(copy.introduction)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:28px 0 20px;">
              <!--[if mso]><v:roundrect href="${actionURL}" style="height:48px;v-text-anchor:middle;width:446px;" arcsize="16%" stroke="f" fillcolor="#222222"><w:anchorlock/><center style="color:#f5f5f5;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escape(copy.action)}</center></v:roundrect><![endif]-->
              <!--[if !mso]><!--><a class="action" href="${actionURL}" style="display:block;background-color:#222222;border:1px solid #222222;border-radius:8px;color:#f5f5f5;font-size:16px;line-height:48px;font-weight:600;text-align:center;text-decoration:none;">${escape(copy.action)}</a><!--<![endif]-->
            </td></tr>
          </table>
          <p class="muted" style="margin:0;color:#666666;font-size:14px;line-height:22px;">${escape(copy.expiry)}</p>
          ${recovery}
        </td></tr>
        <tr><td style="padding:24px 8px 0;">
          <p class="muted" style="margin:0 0 16px;color:#666666;font-size:14px;line-height:22px;">${escape(copy.reassurance)}</p>
          <p style="margin:0;font-size:13px;line-height:20px;"><a class="secondary" href="${home}" style="color:#666666;text-decoration:underline;text-underline-offset:3px;">${escape(base.hostname)}</a></p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: copy.subject, text, html };
}
