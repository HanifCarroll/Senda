import { betterAuth } from "better-auth";
import { authOptions } from "../server/auth-options.js";
import { hash } from "../core/hash.js";
import { fetchClientMetadataResource } from "./cimd.js";
import { accountEmail } from "../server/account-email.js";
import { emailForDelivery } from "./email.js";

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
      sendSignInLink: async ({ email, url }) => {
        const message = {
          from: {
            email: "accounts@mail.senda.hanifcarroll.com",
            name: "Senda",
          },
          to: email,
          ...accountEmail({ url, origin }),
        };
        // A local-only test transport exercises real signed links without sending
        // fixture emails. No public endpoint exposes this private test outbox.
        const local = ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
        if (local && env.LOCAL_EMAIL_OUTBOX === "1")
          await env.SNAPSHOTS.put(`test-outbox/${hash(email)}.json`, JSON.stringify(message));
        else await env.EMAIL.send(emailForDelivery(message));
      },
    }),
  );
}
