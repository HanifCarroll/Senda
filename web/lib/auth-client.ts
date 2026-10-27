import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
// The sign-in screen owns navigation, including the signed OAuth continuation.
export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  plugins: [oauthProviderClient()],
});
