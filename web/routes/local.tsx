import { createFileRoute } from "@tanstack/react-router";
import { getReviews } from "@/lib/reviews";
import type { ReviewChoice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/local")({
  loader: async () => (await getReviews()) as ReviewChoice[],
  component: LocalReviews,
});
function LocalReviews() {
  const reviews = Route.useLoaderData(),
    processes = [...new Map([...reviews].reverse().map((r) => [r.processKey, r])).values()];
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Local process reviews</h1>
      <p className="text-muted-foreground">
        Open a saved export from this computer. Revisions stay in the local library.
      </p>
      {processes.length ? (
        processes.map((r) => (
          <Card key={r.processKey}>
            <CardHeader>
              <CardTitle>{r.title}</CardTitle>
              <CardDescription>
                Revision {r.revision} · {r.summary}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a href={`/?review=${r.id}`}>Open review</a>
              </Button>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No local exports are available</CardTitle>
            <CardDescription>
              Local review files are available only in local review mode. Private shared projects
              are in your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/app">Your processes</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
