import { SendaAgentLink } from "@/components/senda-agent-link";
import { createFileRoute } from "@tanstack/react-router";
import { savedModelSignIn } from '../../shared/model-links.js';
import { useCallback, useEffect, useState } from "react";
import { useMachine } from "@xstate/react";
import { waitFor } from "xstate";
import { createProjectReviewMachine, createProjectMutationMachine } from "@/lib/project-machines.js";
import { Plus, MessageSquare, ArrowLeft, MoreHorizontal, Download, RefreshCw, Trash2 } from "lucide-react";
import { projectTitle } from "@/lib/review-navigation";
import { api, post } from "@/lib/api";
import type { Review, ReviewChoice, Section } from "@/lib/types";
import { AccountFrame } from "@/components/account-frame";
import { ReviewApp } from "@/components/review-app";
import { BrowserAgent } from "@/components/browser-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ModelNavigation,
  type Models,
  type ModelKind,
} from "@/components/model-navigation";

export const Route = createFileRoute("/app/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>) => ({
    model: search.model === "to-be" ? ("to-be" as const) : ("as-is" as const),
    revision:
      Number.isSafeInteger(Number(search.revision)) &&
      Number(search.revision) > 0
        ? Number(search.revision)
        : undefined,
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
  component: ProjectPage,
});
function ProjectPage() {
  const { projectId } = Route.useParams();
  const { model } = Route.useSearch();
  return <Workspace key={`${projectId}:${model}`} />;
}
type ProjectReview = Review & { history: ReviewChoice[] };
function Workspace() {
  const { projectId } = Route.useParams(),
    location = Route.useSearch(),
    navigate = Route.useNavigate();
  const [sourceOpen, setSourceOpen] = useState(false),
    [answerOpen, setAnswerOpen] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [text, setText] = useState(""),
    [question, setQuestion] = useState("");
  const [reviewMachine] = useState(() => createProjectReviewMachine({
    models: (input: any, signal: AbortSignal) => api<Models>(`/api/projects/${input.projectId}/models`, { signal }),
    review: (input: any, signal: AbortSignal) => api<ProjectReview>(
      `/api/projects/${input.projectId}/review?model=${input.model}${input.revision ? `&revision=${input.revision}` : ""}`, { signal }),
    visible: () => !document.hidden,
    navigate: (input: any) => window.location.assign(savedModelSignIn(input.projectId, input.model, input.revision)),
  }));
  const [reviewState, sendReview, reviewActor] = useMachine(reviewMachine);
  const review = reviewState.context.review as ProjectReview | null;
  const models = reviewState.context.models as Models | null;
  const refreshReview = useCallback(async () => {
    sendReview({ type: "REFRESH" });
    await waitFor(reviewActor, (state) => !state.hasTag("loading")).catch(() => {});
  }, [sendReview, reviewActor]);
  const [saveMachine] = useState(() => createProjectMutationMachine({
    submit: (data: any) => post(data.url, data.body),
    committed: async (_result: unknown, data: any) => {
      setSourceOpen(false); setAnswerOpen(false); setText("");
      sendReview({ type: "NOTICE", message: data.kind === "answer"
        ? "Your answer is saved. Ask your agent to update the diagram from it."
        : "Transcript saved. Your agent can read it from this project." });
      await refreshReview();
    },
    failure: (error: any) => error.status === 409
      ? "Your project changed while you were writing. Close this dialog, refresh and save against the latest revision."
      : error.message,
  }));
  const [saving, sendSave] = useMachine(saveMachine);
  const [deleteMachine] = useState(() => createProjectMutationMachine({
    submit: () => post(`/api/projects/${projectId}/delete`, { confirm: true }),
    committed: () => {
      sendReview({ type: "STOP" });
      window.location.assign(`/app?deleted=${encodeURIComponent(projectId)}`);
    },
    redirecting: true,
  }));
  const [deletion, sendDelete] = useMachine(deleteMachine);
  const busy = saving.hasTag("busy"), deleting = deletion.hasTag("busy");
  const error = saving.context.error || reviewState.context.error;
  const deleteError = deletion.context.error, notice = reviewState.context.notice;
  const refresh = useCallback(async () => {
    sendSave({ type: "CLEAR" });
    await refreshReview();
  }, [sendSave, refreshReview]);
  useEffect(() => {
    sendReview({ type: "SELECT", selection: { projectId, model: location.model, revision: location.revision } });
  }, [sendReview, projectId, location.model, location.revision]);
  function save(event: React.FormEvent<HTMLFormElement>, kind: "transcript" | "answer") {
    event.preventDefault();
    if (!review) return;
    const body = kind === "answer"
      ? { expectedRevision: review.revision, questionId: question, text }
      : { expectedRevision: review.revision, source: { id: `Transcript_${crypto.randomUUID()}`, title: String(new FormData(event.currentTarget).get("title")), kind, text } };
    sendSave({ type: "SUBMIT", data: { kind, url: `/api/projects/${projectId}/${kind === "answer" ? "answers" : "sources"}?model=${location.model}`, body } });
  }
  function deleteProject() { sendDelete({ type: "SUBMIT", data: null }); }
  const openQuestions =
    review?.discovery.questions.filter((q) => q.status !== "answered") || [];
  return (
    <AccountFrame wide>
      <BrowserAgent
        projectId={projectId}
        model={location.model}
        onChange={refresh}
        historical={!!location.revision || !models}
        visible={{ ...location, revision: review?.revision }}
      />
      <div className="project-navigation app-header mx-auto flex max-w-[1800px] items-center gap-2 px-4 py-4 sm:gap-4 sm:px-6 sm:py-6">
        <Button variant="ghost" size="icon" asChild>
          <a href="/app" aria-label="Your processes">
            <ArrowLeft data-icon="inline-start" />
          </a>
        </Button>
        {models ? <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">{projectTitle(models.name)}</h1>
          : <Skeleton className="h-7 w-64" />}
        <div className="ml-auto flex flex-wrap gap-2"><SendaAgentLink projectId={projectId} />
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontal /></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Project details</DialogTitle>
                <DialogDescription>{review?.discovery.context.purpose || "Sources and project updates."}</DialogDescription>
              </DialogHeader>
              {review?.discovery.context.scopeNotes && <p className="text-sm leading-relaxed">{review.discovery.context.scopeNotes}</p>}
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" disabled={!review || !!location.revision} onClick={() => { setDetailsOpen(false); setText(""); setSourceOpen(true); }}><Plus data-icon="inline-start" />Add transcript</Button>
                <Button variant="outline" disabled={!openQuestions.length || !!location.revision} onClick={() => { setDetailsOpen(false); setText(""); setAnswerOpen(true); }}><MessageSquare data-icon="inline-start" />Add an answer</Button>
                <Button variant="outline" onClick={() => { setDetailsOpen(false); void refresh(); }}><RefreshCw data-icon="inline-start" />Refresh project</Button>
                <Button variant="destructive" disabled={!models || busy} onClick={() => { setDetailsOpen(false); sendDelete({ type: "CLEAR" }); setDeleteOpen(true); }}><Trash2 data-icon="inline-start" />Delete project</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={deleteOpen} onOpenChange={(value) => { if (!deleting) { setDeleteOpen(value); sendDelete({ type: "CLEAR" }); } }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader className="pr-8">
                <DialogTitle>Delete project?</DialogTitle>
                <DialogDescription className="break-words leading-6">
                  Delete “{projectTitle(models?.name || "this project") }”? You can restore it from Your processes within seven days if you have room under your plan.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-6">The project disappears from your workspace and connected agents lose access. After seven days, its diagrams, sources and conversations are permanently erased. Deleting does not reset your AI allowance.</p>
              {deleteError && <p role="alert" className="text-sm leading-6 text-destructive">{deleteError}</p>}
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>Keep project</Button>
                <Button variant="destructive" disabled={deleting} onClick={() => void deleteProject()}>{deleting ? "Deleting…" : "Delete project"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          {review ? <Button asChild><a aria-label="Download BPMN" download={review.exportFilename} href={`/api/projects/${projectId}/bpmn?model=${location.model}&revision=${review.revision}`}><Download data-icon="inline-start" /><span className="hidden sm:inline">Download BPMN</span></a></Button>
            : <Button disabled aria-label="Download BPMN"><Download data-icon="inline-start" /><span className="hidden sm:inline">Download BPMN</span></Button>}
          <Dialog
            open={sourceOpen}
            onOpenChange={(value) => {
              setSourceOpen(value);
              setText("");
            }}
          >
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add another transcript</DialogTitle>
                <DialogDescription>
                  The source is saved with this project. Your agent uses it in
                  the next revision.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => save(e, "transcript")}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="source-title">Source title</FieldLabel>
                    <Input
                      id="source-title"
                      name="title"
                      required
                      maxLength={160}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="source-file">Upload text</FieldLabel>
                    <Input
                      id="source-file"
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size <= 300000) setText(await f.text());
                        else if (f)
                          sendSave({ type: "ERROR", message: "Choose a text file smaller than 300 KB." });
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="source-text">
                      Transcript text
                    </FieldLabel>
                    <Textarea
                      id="source-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={8}
                      required
                      maxLength={300000}
                    />
                  </Field>
                </FieldGroup>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save transcript"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={answerOpen}
            onOpenChange={(value) => {
              setAnswerOpen(value);
              setText("");
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clarify the process</DialogTitle>
                <DialogDescription>
                  Save your answer for the modeling agent. The question stays
                  open until the agent revises the model and connects the answer
                  to it.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => save(e, "answer")}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="answer-question">Question</FieldLabel>
                    <Select
                      value={question}
                      onValueChange={setQuestion}
                      required
                    >
                      <SelectTrigger
                        id="answer-question"
                        className="h-auto min-h-10 w-full [&>span]:whitespace-normal [&>span]:text-left"
                      >
                        <SelectValue placeholder="Choose a question" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {openQuestions.map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.question}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="answer-text">Your answer</FieldLabel>
                    <Textarea
                      id="answer-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={6}
                      required
                      maxLength={50000}
                    />
                  </Field>
                </FieldGroup>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy || !question}>
                  {busy ? "Saving…" : "Save answer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {models && (
        <ModelNavigation
          models={models}
          selected={location.model}
          onCreated={refresh}
          onSelect={(model: ModelKind) =>
            void navigate({
              search: {
                model,
                revision: undefined,
                view: undefined,
                element: undefined,
                section: "diagram",
                source: undefined,
                segment: undefined,
              },
              resetScroll: false,
            })
          }
          onBaseline={(revision) =>
            void navigate({
              search: {
                model: "as-is",
                revision,
                view: undefined,
                element: undefined,
                section: "diagram",
                source: undefined,
                segment: undefined,
              },
              resetScroll: false,
            })
          }
        />
      )}
      {notice && (
        <p
          role="status"
          className="mx-auto max-w-6xl px-4 pb-4 text-sm text-muted-foreground"
        >
          {notice}
        </p>
      )}
      {location.revision && (
        <Alert className="mx-auto mb-4 max-w-6xl">
          <AlertTitle>
            Viewing {location.model === "to-be" ? "To-be" : "As-is"} revision{" "}
            {location.revision}
          </AlertTitle>
          <AlertDescription>
            Sources and diagrams reflect this saved version.{" "}
            <Button
              variant="link"
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, revision: undefined }),
                })
              }
            >
              Return to latest
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {error && !sourceOpen && !answerOpen && (
        <Alert variant="destructive" className="mx-auto max-w-3xl">
          <AlertTitle>Project needs attention</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={refresh}>
              Refresh
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {models && location.model === "to-be" && !models.toBe ? null : !review ? (
        error ? null : (
          <main className="mx-auto max-w-6xl px-4">
            <p role="status" className="mb-4 text-sm text-muted-foreground">Preparing the diagram…</p>
            <Skeleton className="h-80 w-full" />
          </main>
        )
      ) : review.views.length ? (
        <ReviewApp
          embedded
          hideHeader
          review={review}
          reviews={review.history}
          revisionId={String(review.revision)}
          onAnswer={
            location.revision
              ? undefined
              : (id) => {
                  setQuestion(id);
                  setText("");
                  setAnswerOpen(true);
                }
          }
          location={location}
          refresh={refresh}
          updateLocation={(patch) =>
            navigate({
              search: (previous) => ({ ...previous, ...patch }),
              resetScroll: false,
            })
          }
          changeReview={(id) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                revision: Number(id),
                element: undefined,
                view: undefined,
              }),
            })
          }
        />
      ) : (
        <main className="mx-auto max-w-3xl px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle>Ready for your first process draft</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p>
                Connect your agent, provide the discovery method, and ask it to
                read this project and draft the process from your transcript.
              </p>
              <p className="text-sm text-muted-foreground">
                {review.discovery.sources.length} saved source
                {review.discovery.sources.length === 1 ? "" : "s"}. The diagram
                will appear here when your agent saves a revision.
              </p>
              <Button variant="outline" onClick={refresh}>
                Refresh project
              </Button>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Read saved sources
                </summary>
                {review.discovery.sources.map((source: any) => (
                  <div key={source.id} className="mt-4 flex flex-col gap-2">
                    <h3 className="font-medium">{source.title}</h3>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {source.text}
                    </p>
                  </div>
                ))}
              </details>
            </CardContent>
          </Card>
        </main>
      )}
    </AccountFrame>
  );
}
