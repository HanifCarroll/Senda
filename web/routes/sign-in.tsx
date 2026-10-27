import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/sign-in")({ component: SignIn });
function SignIn() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = new FormData(event.currentTarget),
      data = {
        email: String(fields.get("email")),
        password: String(fields.get("password")),
        name: String(fields.get("name") || ""),
      };
    try {
      const result = register
        ? await authClient.signUp.email(data)
        : await authClient.signIn.email(data);
      if (result.error) setError(result.error.message || "Check your email and password.");
      else {
        const value = result.data as any;
        window.location.assign(value?.url || "/app");
      }
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
          <CardTitle>{register ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>
            Keep your process, its sources and each revision in one private project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-5">
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
            </FieldGroup>
            <Button type="submit" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <Button
            variant="link"
            className="px-0"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Already have an account? Sign in" : "New here? Create an account"}
          </Button>
        </CardFooter>
      </Card>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Use your own agent for the discovery work. Senda makes no model calls of its own.
      </p>
    </main>
  );
}
