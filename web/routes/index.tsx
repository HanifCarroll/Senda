import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getReview, getReviews } from "@/lib/reviews";
import { ReviewApp } from "@/components/review-app";
import type { Review, ReviewChoice, Section } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Marketing } from '@/components/marketing';

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    review: typeof search.review === "string" ? search.review : undefined,
    view: typeof search.view === "string" ? search.view : undefined,
    element: typeof search.element === "string" ? search.element : undefined,
    section: [
      "diagram",
      "walkthrough",
      "questions",
      "sources",
      "checks",
    ].includes(String(search.section))
      ? (search.section as Section)
      : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
    segment: typeof search.segment === "string" ? search.segment : undefined,
  }),
  loaderDeps: ({ search }) => ({ review: search.review }),
  loader: async ({ deps }) => {
    if (!deps.review) return { reviews: [] as ReviewChoice[], review: null };
    const reviews = (await getReviews()) as ReviewChoice[];
    const id = deps.review || reviews[0]?.id;
    return {
      reviews,
      review: id ? ((await getReview({ data: { id } })) as Review) : null,
    };
  },
  pendingComponent: () => (
    <main
      className="mx-auto flex max-w-6xl flex-col gap-6 p-8"
      aria-label="Loading review"
    >
      <Skeleton className="h-10 w-60" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-[560px] w-full" />
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-xl p-8">
      <Alert variant="destructive">
        <AlertTitle>This review could not be opened</AlertTitle>
        <AlertDescription>
          Check that the export is complete and still in the review library.
        </AlertDescription>
      </Alert>
      <div className="mt-4 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/">Open latest review</a>
        </Button>
      </div>
    </main>
  ),
  component: Page,
});

function Page() {
  const { reviews, review } = Route.useLoaderData();
  const location = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  if (!review) return <Marketing />;
  return (
    <ReviewApp
      key={review.id}
      review={review}
      reviews={reviews}
      location={location}
      updateLocation={(patch) =>
        navigate({
          search: (previous) => ({ ...previous, review: review.id, ...patch }),
          resetScroll: false,
        })
      }
      changeReview={(id) =>
        void navigate({
          search: {
            review: id,
            view: undefined,
            element: undefined,
            section: undefined,
            source: undefined,
            segment: undefined,
          },
        })
      }
      refresh={() => void router.invalidate()}
    />
  );
}
