import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// GET never consumes the token: ordinary email scanners cannot burn the link.
export const Route = createFileRoute("/sign-in_/confirm")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : undefined,
    callbackURL: typeof s.callbackURL === "string" ? s.callbackURL : undefined,
    errorCallbackURL: typeof s.errorCallbackURL === "string" ? s.errorCallbackURL : undefined,
  }),
  component: Confirm,
});
function Confirm() {
  const query = Route.useSearch(),
    [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  function signIn() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    window.location.replace(`/api/auth/magic-link/verify?${params}`);
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <a href="/" aria-label="Senda home" className="w-fit"><Brand className="h-10" /></a>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to Senda</CardTitle>
          <CardDescription>Confirm to open your private processes on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.token ? (
            <Button className="w-full" type="button" disabled={!ready} onClick={signIn}>
              Continue to Senda
            </Button>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>This link is incomplete</AlertTitle>
              <AlertDescription>
                <a href="/sign-in" className="underline">
                  Request a new sign-in link.
                </a>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
