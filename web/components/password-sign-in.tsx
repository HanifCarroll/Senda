import { Brand } from "@/components/brand";
import { useEffect, useState } from "react";
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
  const [register, setRegister] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reset, setReset] = useState(false),
    [notice, setNotice] = useState(""),
    [accountEmail, setAccountEmail] = useState(false),
    [verifyEmail, setVerifyEmail] = useState("");
  useEffect(() => {
    setReady(true);
    void api<{ accountEmail: boolean }>("/api/config")
      .then((x) => setAccountEmail(x.accountEmail))
      .catch(() => {});
  }, []);
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email: verifyEmail,
        callbackURL: window.location.origin + "/sign-in",
      });
      if (result.error) setError(result.error.message || "Try again in a moment.");
      else
        setNotice(
          "If this address needs verification, a new link is on its way. Check your inbox and spam folder.",
        );
    } catch {
      setError("The email service could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const fields = new FormData(event.currentTarget),
      data = {
        email: String(fields.get("email")),
        password: String(fields.get("password")),
        name: String(fields.get("name") || ""),
      };
    try {
      if (reset) {
        const result = await authClient.requestPasswordReset({
          email: data.email,
          redirectTo: window.location.origin + "/reset-password",
        });
        if (result.error) setError(result.error.message || "Try again in a moment.");
        else
          setNotice(
            "If an account uses this email address, a password-reset link is on its way. Check your inbox and spam folder.",
          );
        return;
      }
      const result = register
        ? await authClient.signUp.email({
            ...data,
            callbackURL: window.location.origin + "/sign-in" + window.location.search,
          })
        : await authClient.signIn.email(data);
      if (result.error) {
        setError(result.error.message || "Check your email and password.");
        if (result.error.code === "EMAIL_NOT_VERIFIED") setVerifyEmail(data.email);
      } else {
        const value = result.data as any;
        if (register && !value?.token) {
          setVerifyEmail(data.email);
          setNotice(
            "Check your inbox for a verification link. Once your email is verified, return here to sign in.",
          );
          setRegister(false);
        } else window.location.assign(value?.url || "/app");
      }
    } catch {
      setError("The account service could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
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
            <Button variant="outline" className="mb-5 w-full" disabled={busy} onClick={resend}>
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
            onClick={() => {
              setRegister(reset ? false : !register);
              setReset(false);
              setNotice("");
              setVerifyEmail("");
              setError("");
            }}
          >
            {reset || register ? "Back to sign in" : "New here? Create an account"}
          </Button>
          {accountEmail && !register && !reset && (
            <Button
              variant="link"
              className="px-0"
              onClick={() => {
                setReset(true);
                setError("");
                setNotice("");
                setVerifyEmail("");
              }}
            >
              Forgot password?
            </Button>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
