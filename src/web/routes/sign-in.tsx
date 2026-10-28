import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { PasswordSignIn } from "@/components/password-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup, FieldSeparator } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/sign-in")({ component: SignIn });
type Capabilities = { loginMethods?: { magicLink: boolean; google: boolean; password: boolean } };

function SignIn() {
  const [config, setConfig] = useState<Capabilities | null>(null),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void api<Capabilities>("/api/config", { signal: abort.signal })
      .then(setConfig)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    const issue = new URLSearchParams(window.location.search).get("error");
    if (issue)
      setError(
        issue === "access_denied"
          ? "Sign-in was cancelled. You can try again."
          : issue === "account_not_linked" || issue === "email_not_verified"
            ? "Use an email sign-in link to access this account."
            : ["INVALID_TOKEN", "TOKEN_EXPIRED", "EXPIRED_TOKEN"].includes(issue)
              ? "This sign-in link is unavailable or has expired. Request a new link below."
              : "Sign-in could not be completed. Please try again.",
      );
    return () => abort.abort();
  }, []);
  if (config?.loginMethods?.password && !config.loginMethods.magicLink) return <PasswordSignIn />;
  function returnTo() {
    const query = new URLSearchParams(window.location.search);
    // Consent verifies the signed query. Never accept an arbitrary return URL.
    return (
      window.location.origin +
      (query.has("sig") && query.has("client_id") ? `/consent${window.location.search}` : "/app")
    );
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: returnTo(),
        errorCallbackURL: window.location.origin + "/sign-in",
      });
      if (r.error) setError(r.error.message || "The sign-in link could not be sent. Try again.");
      else setSent(true);
    } catch {
      setError("The sign-in service could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const r = await authClient.signIn.social({
        provider: "google",
        callbackURL: returnTo(),
        errorCallbackURL: window.location.origin + "/sign-in",
      });
      if (r.error) setError(r.error.message || "Google sign-in could not be started. Try again.");
      else if (r.data?.url) window.location.assign(r.data.url);
    } catch {
      setError("Google sign-in could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <a href="/" aria-label="Senda home" className="w-fit"><Brand className="h-10" /></a>
      <Card>
        <CardHeader>
          <CardTitle>{sent ? "Check your email" : "Sign in to Senda"}</CardTitle>
          <CardDescription>
            Keep your process, its sources and each revision in one private project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Sign-in needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {sent && (
            <Alert>
              <Mail />
              <AlertTitle>Your sign-in link is on its way</AlertTitle>
              <AlertDescription>
                Open the email sent to {email.trim()} and confirm to sign in. The link expires in 10
                minutes. Check your spam folder if it does not arrive.
              </AlertDescription>
            </Alert>
          )}
          {config?.loginMethods?.google && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={google}
              >
                Continue with Google
              </Button>
              <FieldSeparator>or continue with email</FieldSeparator>
            </>
          )}
          <form method="post" onSubmit={send} className="flex flex-col gap-5">
            <FieldGroup>
              <Field data-disabled={!config || busy}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSent(false);
                  }}
                  disabled={!config || busy}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={!config?.loginMethods?.magicLink || busy}>
              {busy ? "Please wait…" : sent ? "Send another link" : "Send sign-in link"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            New here? Confirming your email creates your account.
          </p>
        </CardFooter>
      </Card>
      <a href="/privacy" className="text-sm text-muted-foreground underline underline-offset-4">
        How Senda handles your information
      </a>
    </main>
  );
}
