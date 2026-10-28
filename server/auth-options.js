import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
export function authOptions({
  origin,
  database,
  secret,
  projects,
  appName = "Senda",
  sendEmail,
  cimdTransport,
}) {
  return {
    appName: appName,
    baseURL: origin,
    secret,
    database,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: !!sendEmail,
      ...(sendEmail
        ? {
            sendResetPassword: ({ user, url }) => sendEmail(user, url, "reset"),
            revokeSessionsOnPasswordReset: true,
            resetPasswordTokenExpiresIn: 1800,
          }
        : {}),
    },
    ...(sendEmail
      ? {
          emailVerification: {
            sendVerificationEmail: ({ user, url }) =>
              sendEmail(user, url, "verify"),
            sendOnSignUp: true,
            sendOnSignIn: false,
            autoSignInAfterVerification: false,
            expiresIn: 3600,
          },
        }
      : {}),
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: origin.startsWith("https:"),
      ipAddress: { ipAddressHeaders: ["x-scribe-client-ip"] },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 40 },
    plugins: [
      jwt(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: `${origin}/mcp`,
        scopes: [
          "openid",
          "profile",
          "offline_access",
          "projects:read",
          "projects:write",
        ],
        accessTokenExpiresIn: 900,
        customAccessTokenClaims: async ({ user }) => ({
          scribe_epoch: user ? await projects.epoch(user.id) : -1,
        }),
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
      }),
      ...(cimdTransport
        ? [
            cimd({
              fetchClientMetadataResource: cimdTransport,
              metadataProfile: "mcp-2026-07-28",
            }),
          ]
        : []),
    ],
  };
}
