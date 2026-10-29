import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { PasswordSignIn } from "@/components/password-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { signInDestination, signInRetry } from '../../shared/model-links.js';

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
    return window.location.origin + signInDestination(window.location.search);
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: returnTo(),
        errorCallbackURL: window.location.origin + signInRetry(window.location.search),
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
        errorCallbackURL: window.location.origin + signInRetry(window.location.search),
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
    <main className="auth-page flex min-h-svh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" aria-label="Senda home" className="mx-auto w-fit"><Brand className="h-9" /></a>
        <Card className="[--card-spacing:--spacing(6)]">
          <CardHeader className="gap-2 text-center">
            <CardTitle><h1 className="text-2xl font-semibold tracking-tight">{sent ? "Check your email" : "Sign in to Senda"}</h1></CardTitle>
            <CardDescription>
              {sent ? "Your sign-in link is valid for 10 minutes." : "Continue to your projects."}
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
                  Open the email sent to {email.trim()} and confirm to sign in. Check your spam folder
                  if it does not arrive.
                </AlertDescription>
              </Alert>
            )}
            {config?.loginMethods?.google && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="relative h-11 w-full"
                  disabled={busy}
                  onClick={google}
                >
                  <img src="/brand/google-g.png" alt="" aria-hidden="true" width="20" height="20" className="absolute left-4 size-5 object-contain" />
                  Sign in with Google
                </Button>
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="shrink-0 text-xs text-muted-foreground">or continue with email</span>
                  <Separator className="flex-1" />
                </div>
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
                    placeholder="you@example.com"
                    className="h-11"
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
              <Button type="submit" className="h-11" disabled={!config?.loginMethods?.magicLink || busy}>
                {busy ? "Please wait…" : sent ? "Send another link" : "Send sign-in link"}
              </Button>
            </form>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Your first sign-in creates your account.
            </p>
          </CardContent>
        </Card>
        <a href="/privacy" className="self-center text-xs text-muted-foreground underline underline-offset-4">
          Privacy policy
        </a>
      </div>
    </main>
  );
}
