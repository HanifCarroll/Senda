import { Brand } from "@/components/brand";
import { useEffect, useState } from "react";
import { useMachine } from "@xstate/react";
import { createPasswordMachine } from "@/lib/account-machines.js";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function PasswordSignIn() {
  const [machine] = useState(() => createPasswordMachine({
    load: (signal: AbortSignal) => api<{ accountEmail: boolean }>("/api/config", { signal }),
    location: () => window.location,
    navigate: (url: string) => window.location.assign(url),
    signUp: (input: any) => authClient.signUp.email(input),
    signIn: (input: any) => authClient.signIn.email(input),
    reset: (input: any) => authClient.requestPasswordReset(input),
    verify: (input: any) => authClient.sendVerificationEmail(input),
  }));
  const [state, send] = useMachine(machine);
  const { error, notice, accountEmail, verifyEmail } = state.context;
  const ready = !state.matches("unready"), busy = state.hasTag("busy");
  const register = state.matches({ ready: { form: "register" } });
  const reset = state.matches({ ready: { form: "reset" } });
  useEffect(() => { send({ type: "START" }); }, [send]);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    send({ type: "SUBMIT", data: {
      email: String(fields.get("email")),
      password: String(fields.get("password")),
      name: String(fields.get("name") || ""),
    } });
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <a href="/" aria-label="Senda home" className="w-fit"><Brand className="h-10" /></a>
      <Card>
        <CardHeader>
          <CardTitle>
            {reset ? "Reset your password" : register ? "Create your account" : "Welcome back"}
          </CardTitle>
          <CardDescription>
            Keep your process, its sources and each revision in one private project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notice && (
            <Alert className="mb-5">
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {accountEmail && verifyEmail && (
            <Button variant="outline" className="mb-5 w-full" disabled={busy} onClick={() => send({ type: "RESEND" })}>
              Resend verification email
            </Button>
          )}
          <form method="post" onSubmit={submit} className="flex flex-col gap-5">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Sign-in needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              {register && (
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" name="name" autoComplete="name" required maxLength={120} />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </Field>
              {!reset && (
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={register ? "new-password" : "current-password"}
                    required
                    minLength={12}
                    maxLength={128}
                  />
                  {register && (
                    <p className="text-xs text-muted-foreground">Use at least 12 characters.</p>
                  )}
                </Field>
              )}
            </FieldGroup>
            <Button type="submit" disabled={!ready || busy}>
              {busy
                ? "Please wait…"
                : reset
                  ? "Send reset link"
                  : register
                    ? "Create account"
                    : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          <Button
            variant="link"
            className="px-0"
            disabled={!ready || busy}
            onClick={() => send({ type: "TOGGLE_ACCOUNT" })}
          >
            {reset || register ? "Back to sign in" : "New here? Create an account"}
          </Button>
          {accountEmail && !register && !reset && (
            <Button
              variant="link"
              className="px-0"
              disabled={!ready || busy}
              onClick={() => send({ type: "RESET" })}
            >
              Forgot password?
            </Button>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
