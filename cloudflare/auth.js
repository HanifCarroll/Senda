import { betterAuth } from "better-auth";
import { authOptions } from "../server/auth-options.js";
import { hash } from "../src/hash.js";
import { fetchClientMetadataResource } from "./cimd.js";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function cloudAuth(env, origin, projects) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("The account signing secret is not configured.");
  return betterAuth(
    authOptions({
      origin,
      database: env.DB,
      secret: env.BETTER_AUTH_SECRET,
      projects,
      cimdTransport: fetchClientMetadataResource,
      passwordless: true,
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
          }
        : {}),
      sendEmail: async (user, url, kind) => {
        if (new URL(url).origin !== origin) throw new Error("Invalid account email link.");
        const magic = kind === "magic",
          verify = kind === "verify",
          link = magic ? new URL(`/sign-in/confirm${new URL(url).search}`, origin).href : url,
          subject = magic
            ? "Sign in to Senda"
            : verify
              ? "Verify your Senda email"
              : "Reset your Senda password";
        const introduction = magic
          ? "Use this link to sign in to Senda. Confirm on the page that opens."
          : verify
            ? "Verify your email to finish setting up your Senda account."
            : "Use this link to choose a new Senda password.";
        const expiry = magic
          ? "This link expires in 10 minutes and can be used once."
          : verify
            ? "This link expires in one hour."
            : "This link expires in 30 minutes.";
        const text = `${introduction}\n\n${link}\n\n${expiry} If you did not request this, you can ignore this email.`;
        const message = {
          from: {
            email: "accounts@mail.senda.hanifcarroll.com",
            name: "Senda",
          },
          to: user.email,
          subject,
          text,
          html: `<p>${introduction}</p><p><a href="${escape(link)}">${magic ? "Sign in to Senda" : verify ? "Verify email" : "Reset password"}</a></p><p>${expiry} If you did not request this, you can ignore this email.</p>`,
        };
        // A local-only test transport exercises real signed links without sending
        // fixture emails. No public endpoint exposes this private test outbox.
        const local = ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
        if (local && env.LOCAL_EMAIL_OUTBOX === "1")
          await env.SNAPSHOTS.put(`test-outbox/${hash(user.email)}.json`, JSON.stringify(message));
        else await env.EMAIL.send(message);
      },
    }),
  );
}
