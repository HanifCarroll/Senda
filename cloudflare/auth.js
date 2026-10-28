import { betterAuth } from "better-auth";
import { authOptions } from "../server/auth-options.js";
import { hash } from "../src/hash.js";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
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
      // URL discovery's pinned Node HTTPS transport is not supported by Workers.
      // Dynamic OAuth registration and PKCE use the shared, tested MCP provider.
      sendEmail: async (user, url, kind) => {
        if (new URL(url).origin !== origin)
          throw new Error("Invalid account email link.");
        const verify = kind === "verify",
          subject = verify
            ? "Verify your Senda email"
            : "Reset your Senda password";
        const text = `${verify ? "Verify your email to finish setting up your Senda account." : "Use this link to choose a new Senda password."}\n\n${url}\n\n${verify ? "This link expires in one hour." : "This link expires in 30 minutes."} If you did not request this, you can ignore this email.`;
        const message = {
          from: {
            email: "accounts@mail.senda.hanifcarroll.com",
            name: "Senda",
          },
          to: user.email,
          subject,
          text,
          html: `<p>${verify ? "Verify your email to finish setting up your Senda account." : "Use this link to choose a new Senda password."}</p><p><a href="${escape(url)}">${verify ? "Verify email" : "Reset password"}</a></p><p>${verify ? "This link expires in one hour." : "This link expires in 30 minutes."} If you did not request this, you can ignore this email.</p>`,
        };
        // A local-only test transport exercises real signed links without sending
        // fixture emails. No public endpoint exposes this private test outbox.
        const local = ["127.0.0.1", "localhost"].includes(
          new URL(origin).hostname,
        );
        if (local && env.LOCAL_EMAIL_OUTBOX === "1")
          await env.SNAPSHOTS.put(
            `test-outbox/${hash(user.email)}.json`,
            JSON.stringify(message),
          );
        else await env.EMAIL.send(message);
      },
    }),
  );
}
