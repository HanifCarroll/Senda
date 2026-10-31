import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMachine } from "@xstate/react";
import { createSignInMachine } from "@/lib/account-machines.js";
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

export const Route = createFileRoute("/sign-in")({ component: SignIn });
type Capabilities = { loginMethods?: { magicLink: boolean; google: boolean; password: boolean } };

function SignIn() {
  const [email, setEmail] = useState("");
  const [machine] = useState(() => createSignInMachine({
    load: (signal: AbortSignal) => api<Capabilities>("/api/config", { signal }),
    location: () => window.location,
    navigate: (url: string) => window.location.assign(url),
    magicLink: (input: any) => authClient.signIn.magicLink(input),
    social: (input: any) => authClient.signIn.social(input),
  }));
  const [state, send] = useMachine(machine);
  const config = state.context.config as Capabilities | null;
  const error = state.context.error as string;
  const sent = state.hasTag("sent"), busy = state.hasTag("busy");
  useEffect(() => {
    send({ type: "START", issue: new URLSearchParams(window.location.search).get("error") });
  }, [send]);
  if (config?.loginMethods?.password && !config.loginMethods.magicLink) return <PasswordSignIn />;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send({ type: "SEND", email });
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
                  onClick={() => send({ type: "GOOGLE" })}
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
            <form method="post" onSubmit={submit} className="flex flex-col gap-5">
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
                      send({ type: "EDIT" });
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
