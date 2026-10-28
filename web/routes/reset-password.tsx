import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/reset-password")({ component: Passwordless });
function Passwordless() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>No password needed</CardTitle>
          <CardDescription>
            Senda now sends a secure email link when you sign in. Your existing processes are still
            in your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/sign-in">Get a sign-in link</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
