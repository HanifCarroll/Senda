import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ReviewApp } from "@/components/review-app";
import { api } from "@/lib/api";
import type { Review, Section } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export const Route = createFileRoute("/example")({
  validateSearch: (s: Record<string, unknown>) => ({
    draft: s.draft === true || s.draft === "true",
    view: typeof s.view === "string" ? s.view : undefined,
    element: typeof s.element === "string" ? s.element : undefined,
    section: ["diagram", "walkthrough", "questions", "sources", "checks"].includes(
      String(s.section),
    )
      ? (s.section as Section)
      : undefined,
    source: typeof s.source === "string" ? s.source : undefined,
    segment: typeof s.segment === "string" ? s.segment : undefined,
  }),
  component: Example,
});
function Example() {
  const search = Route.useSearch(),
    navigate = Route.useNavigate(),
    [review, setReview] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void api(`/examples/onboarding-${search.draft ? "draft" : "final"}.json`, { signal: c.signal })
      .then(setReview)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [search.draft]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 text-sm">
        <p>This is a fictional interview and scripted revision example.</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void navigate({
                search: {
                  draft: !search.draft,
                  view: undefined,
                  element: undefined,
                  section: "diagram",
                  source: undefined,
                  segment: undefined,
                },
              })
            }
          >
            {search.draft ? "See revised process" : "See first draft"}
          </Button>
          <Button size="sm" asChild>
            <a href="/app">Start your own</a>
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Example unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : review ? (
        <ReviewApp
          review={review as Review}
          revisionId={String(review.revision)}
          reviews={review.history.filter((h: any) => [2, 5].includes(h.revision))}
          location={search}
          updateLocation={(patch) =>
            navigate({ search: (previous) => ({ ...previous, ...patch }), resetScroll: false })
          }
          changeReview={(id) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                draft: Number(id) === 2,
                view: undefined,
                element: undefined,
              }),
            })
          }
          refresh={() => window.location.reload()}
        />
      ) : (
        <Skeleton className="mx-auto mt-10 h-96 max-w-6xl" />
      )}
    </>
  );
}
