import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  component: ResetPassword,
});
function ResetPassword() {
  const { token, error: linkError } = Route.useSearch();
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => setReady(true), []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await authClient.resetPassword({
        token: token!,
        newPassword: String(data.get("password")),
      });
      if (r.error)
        setError(
          r.error.message ||
            "This reset link is no longer valid. Request a new one.",
        );
      else setDone(true);
    } catch {
      setError("The account service could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <a href="/" className="text-sm font-medium">
        ← Senda
      </a>
      <Card>
        <CardHeader>
          <CardTitle>
            {done ? "Password updated" : "Choose a new password"}
          </CardTitle>
          <CardDescription>
            {done
              ? "Your previous sessions have been signed out. Sign in with your new password."
              : "Use at least 12 characters."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Button asChild className="w-full">
              <a href="/sign-in">Sign in</a>
            </Button>
          ) : !token || linkError ? (
            <Alert variant="destructive">
              <AlertTitle>This link is unavailable</AlertTitle>
              <AlertDescription>
                The password-reset link expired or is incomplete.{" "}
                <a href="/sign-in" className="underline">
                  Return to sign in and request a new link.
                </a>
              </AlertDescription>
            </Alert>
          ) : (
            <form method="post" onSubmit={submit} className="flex flex-col gap-5">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input
                    id="new-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm new password
                  </FieldLabel>
                  <Input
                    id="confirm-password"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </Field>
              </FieldGroup>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={!ready || busy}>
                {busy ? "Saving…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
