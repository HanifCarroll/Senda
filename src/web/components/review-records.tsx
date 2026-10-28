import { Copy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { Review, Question } from "@/lib/types";
import { readableLabel } from "@/lib/review-navigation";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { AgentRequest } from "./agent-request";

function QuestionItems({
  questions,
  review,
  onSource,
  onGo,
  onAnswer,
}: {
  questions: Question[];
  review: Review;
  onSource: (id: string, segment: string) => void;
  onGo: (id: string) => void;
  onAnswer?: (id: string) => void;
}) {
  return (
    <Accordion
      type="multiple"
      defaultValue={questions
        .filter((q) => q.status !== "answered")
        .slice(0, 1)
        .map((q) => q.id)}
    >
      {questions.map((q) => (
        <AccordionItem key={q.id} value={q.id}>
          <AccordionTrigger>
            <span className="flex flex-col items-start gap-2 text-left">
              <Badge variant={q.status === "answered" ? "secondary" : "outline"}>
                {q.status === "answered" ? "Answered" : "Needs clarification"}
              </Badge>
              {q.question}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground">{q.why}</p>
              {q.status !== "answered" &&
                review.discovery.sources
                  .filter((s) => s.origin === `clarification:${q.id}`)
                  .map((s) => (
                    <Alert key={s.id}>
                      <AlertTitle>Answer saved for your agent</AlertTitle>
                      <AlertDescription>
                        <p className="whitespace-pre-wrap">{s.text}</p>
                        <p>
                          The question remains open until the model is revised from this answer.
                        </p>
                        <Button variant="link" onClick={() => onSource(s.id, s.segments[0]?.id)}>
                          Read saved answer
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ))}
              {q.answerEvidence?.length ? (
                q.answerEvidence.map((e, i) => (
                  <blockquote key={i} className="border-l-2 border-primary/30 pl-4">
                    <p className="leading-relaxed">{e.quote}</p>
                    <Button
                      variant="link"
                      className="mt-2"
                      onClick={() => onSource(e.sourceId, e.segmentId)}
                    >
                      Read the source
                    </Button>
                  </blockquote>
                ))
              ) : q.answerSourceId ? (
                <p className="leading-relaxed">
                  {review.discovery.sources.find((s) => s.id === q.answerSourceId)?.text}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Share your answer with the modeling agent to update the diagram.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {q.elementIds?.map((id) => (
                  <Button key={id} variant="outline" size="sm" onClick={() => onGo(id)}>
                    {readableLabel(review.elements.find((e) => e.id === id))}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(q.question);
                      toast.success("Question copied");
                    } catch {
                      toast.error("Copy was unavailable. Select and copy the question manually.");
                    }
                  }}
                >
                  <Copy data-icon="inline-start" />
                  Copy question
                </Button>
                {onAnswer && q.status !== "answered" ? (
                  <Button onClick={() => onAnswer(q.id)}>Answer question</Button>
                ) : (
                  <AgentRequest
                    key={q.id}
                    title={q.status === "answered" ? "Clarify this answer" : "Prepare my answer"}
                    prompt={`Use $process-scribe to continue “${review.title}” from revision ${review.revision}.\n\nQuestion (${q.id}): ${q.question}\n\nMy answer or correction:\n[Write your answer here.]\n\nLink the new answer as evidence, update the affected steps and explanation, and export the next revision. Keep unresolved details explicit.`}
                  />
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function Clarifications({
  review,
  onSource,
  onGo,
  onAnswer,
}: {
  review: Review;
  onSource: (id: string, segment: string) => void;
  onGo: (id: string) => void;
  onAnswer?: (id: string) => void;
}) {
  const open = review.discovery.questions
    .filter((q) => q.status !== "answered")
    .sort((a, b) => Number(!!b.blocking) - Number(!!a.blocking));
  const answered = review.discovery.questions.filter((q) => q.status === "answered");
  return (
    <div className="reading-column flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>
            {open.length
              ? `${open.length} questions to clarify`
              : "All recorded questions have answers"}
          </CardTitle>
          <CardDescription>
            {onAnswer
              ? "Save an answer here, then ask your agent to revise the process. The saved diagram updates automatically."
              : "Use an answer request to continue with your modeling agent. The next export will include the updated diagram."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {open.length ? (
            <QuestionItems
              questions={open}
              review={review}
              onSource={onSource}
              onGo={onGo}
              onAnswer={onAnswer}
            />
          ) : (
            <p className="text-muted-foreground">
              Read through the process to see whether anything else needs clarification.
            </p>
          )}
        </CardContent>
      </Card>
      {answered.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Answer history ({answered.length})</CardTitle>
            <CardDescription>
              Earlier clarifications remain attached to their source passages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionItems questions={answered} review={review} onSource={onSource} onGo={onGo} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function Sources({
  review,
  selected,
  setSelected,
  segment,
  onReturn,
}: {
  review: Review;
  selected: string[];
  setSelected: (ids: string[]) => void;
  segment?: string;
  onReturn: () => void;
}) {
  return (
    <Card className="reading-column">
      <CardHeader>
        <CardTitle>Transcript and clarification sources</CardTitle>
        <CardDescription>Original passages stay available alongside the model.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="mb-4" onClick={onReturn}>
          Return to diagram
        </Button>
        <Accordion type="multiple" value={selected} onValueChange={setSelected}>
          {review.discovery.sources.map((source) => (
            <AccordionItem key={source.id} value={source.id}>
              <AccordionTrigger>{source.title}</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-3">
                  {source.segments.map((s) => (
                    <p
                      id={`source-${source.id}-${s.id}`}
                      key={s.id}
                      className={
                        segment === `${source.id}-${s.id}`
                          ? "rounded-md bg-accent p-3 text-accent-foreground leading-relaxed"
                          : "p-3 leading-relaxed"
                      }
                    >
                      {s.text}
                    </p>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export function SourcePassage({
  review,
  sourceId,
  segmentId,
}: {
  review: Review;
  sourceId?: string;
  segmentId?: string;
}) {
  const source = review.discovery.sources.find((s) => s.id === sourceId);
  if (!source) return <p className="p-4">This source is unavailable in the selected revision.</p>;
  const passage = source.segments.find((s) => s.id === segmentId);
  return (
    <div className="flex flex-col gap-5 p-4 pt-0">
      <p className="text-sm text-muted-foreground">{source.title}</p>
      {passage ? (
        <blockquote className="rounded-md border-l-2 border-primary bg-accent p-4 leading-relaxed">
          {passage.text}
        </blockquote>
      ) : (
        <p>Choose a passage from the evidence panel.</p>
      )}
      <Accordion type="single" collapsible>
        <AccordionItem value="context">
          <AccordionTrigger>Read the full source</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              {source.segments.map((s) => (
                <p key={s.id} className="leading-relaxed">
                  {s.text}
                </p>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export function Walkthrough({ review, onGo }: { review: Review; onGo: (id: string) => void }) {
  if (review.quality.walkthrough?.status === "stale")
    return (
      <Alert className="reading-column">
        <AlertTitle>Written walkthrough needs an update</AlertTitle>
        <AlertDescription>
          The model or its evidence changed. Refresh the explanation before using it to review this
          version.
        </AlertDescription>
      </Alert>
    );
  return (
    <Card className="reading-column">
      <CardHeader>
        <CardTitle>Read through the process</CardTitle>
        <CardDescription>Follow the story, then jump to any step in the diagram.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {review.discovery.walkthrough?.steps?.map((step, i) => (
          <div key={step.id} className="flex gap-4">
            <Badge variant="secondary" className="h-fit">
              {i + 1}
            </Badge>
            <div className="flex min-w-0 flex-col gap-3">
              <p className="leading-relaxed">{step.text}</p>
              <div className="flex flex-wrap gap-2">
                {step.elementIds.map((id) => (
                  <Button
                    key={id}
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal py-2 text-left"
                    onClick={() => onGo(id)}
                  >
                    {readableLabel(review.elements.find((e) => e.id === id))}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {!review.discovery.walkthrough?.steps?.length ? (
          <p className="text-muted-foreground">
            A written walkthrough has not been added to this revision yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ReviewChecks({
  review,
  onQuestions,
  onGo,
  onView,
}: {
  review: Review;
  onQuestions: () => void;
  onGo: (id: string) => void;
  onView: (id: string) => void;
}) {
  const total = (key: string) =>
    review.views.reduce((sum, v) => sum + (v.layoutCounts[key] || 0), 0);
  const open = review.discovery.questions.filter((q) => q.status !== "answered");
  const cases = review.discovery.scenarios || [];
  const nextCase = cases.find(
    (s) => review.quality.scenarios?.find((c) => c.id === s.id)?.review?.outcome !== "confirmed",
  );
  return (
    <div className="flex flex-col gap-5">
      <Card className="reading-column">
        <CardHeader>
          <CardTitle>Next review step</CardTitle>
          <CardDescription>
            {open.length
              ? "Clarify missing details before checking the whole process."
              : nextCase
                ? "Walk through a concrete case with someone who knows the work."
                : "Review the explanation and record any corrections with your agent."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          {open.length ? (
            <Button onClick={onQuestions}>
              Answer {open.length} open questions
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : nextCase ? (
            <>
              <p className="font-medium">{nextCase.title}</p>
              <p className="leading-relaxed">{nextCase.given}</p>
              <p className="text-muted-foreground">Expected outcome: {nextCase.expectedOutcome}</p>
              <div className="flex flex-wrap gap-2">
                {nextCase.path?.slice(0, 3).map((id) => (
                  <Button key={id} variant="outline" onClick={() => onGo(id)}>
                    {readableLabel(review.elements.find((e) => e.id === id))}
                  </Button>
                ))}
              </div>
              <AgentRequest
                title="Prepare review feedback"
                prompt={`Use $process-scribe to record my feedback for “${review.title}”, revision ${review.revision}.\n\nCase (${nextCase.id}): ${nextCase.title}\n\nWhat I observed / my correction:\n[Describe what is correct, missing or different.]\n\nAsk for clarification as needed. Do not record approval unless I explicitly give it.`}
              />
            </>
          ) : (
            <AgentRequest
              title="Prepare review feedback"
              prompt={`Review “${review.title}”, revision ${review.revision}.\n\nMy feedback:\n[Describe any missing or incorrect details.]\n\nUse $process-scribe to update the evidence and diagram, and export the next revision.`}
            />
          )}
        </CardContent>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Automated checks</CardTitle>
            <CardDescription>
              Checks support the review; they do not confirm that the process matches reality.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Badge
              variant={review.quality.structural.passed ? "secondary" : "destructive"}
              className="w-fit"
            >
              {review.quality.structural.passed
                ? "Structural checks passed"
                : "Structural issues found"}
            </Badge>
            <p>
              {review.quality.rendering.drawnMessages} of {review.quality.rendering.totalMessages}{" "}
              message exchanges shown
            </p>
            <p>
              {total("crossings")} remaining crossings ·{" "}
              {total("labelOnLine") + total("labelClash")} label collisions detected
            </p>
            <p className="text-sm text-muted-foreground">
              Layout checks use drawing bounds. Inspect every view at 100% as well as fitted to the
              screen; clean metrics do not confirm readability.
            </p>
            <Accordion type="multiple">
              {review.views
                .filter((v) => v.readabilityFindings?.length)
                .map((v) => (
                  <AccordionItem key={v.elementId} value={v.elementId}>
                    <AccordionTrigger>{v.title}</AccordionTrigger>
                    <AccordionContent className="flex flex-col items-start gap-3">
                      <ul className="flex list-disc flex-col gap-2 pl-5">
                        {v.readabilityFindings?.map((finding) => (
                          <li key={finding.code}>
                            {finding.message} ({finding.count})
                          </li>
                        ))}
                      </ul>
                      <Button variant="outline" onClick={() => onView(v.elementId)}>
                        Open this view
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Human review</CardTitle>
            <CardDescription>
              {review.quality.readyToFinalize
                ? "Required reviews are recorded."
                : "This revision is a draft awaiting feedback."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="requirements">
                <AccordionTrigger>
                  {review.quality.blockers.length} review requirements
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="flex list-disc flex-col gap-3 pl-5">
                    {review.quality.blockers.map((b, i) => (
                      <li key={i}>{b.message}</li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <Accordion type="multiple">
              {cases.map((s) => (
                <AccordionItem key={s.id} value={s.id}>
                  <AccordionTrigger>{s.title}</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-3">Starting situation: {s.given}</p>
                    <p>Expected outcome: {s.expectedOutcome}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
      <Card className="reading-column">
        <CardHeader>
          <CardTitle>What changed</CardTitle>
          <CardDescription>
            {review.changes?.summary || "No previous revision to compare."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(["created", "changed", "removed"] as const).map((kind) =>
              review.changes?.model?.[kind]?.length ? (
                <Badge key={kind} variant="secondary">
                  {review.changes.model[kind]!.length} elements{" "}
                  {kind === "created" ? "added" : kind === "changed" ? "updated" : "removed"}
                </Badge>
              ) : null,
            )}
          </div>
          <Accordion type="single" collapsible>
            <AccordionItem value="diff">
              <AccordionTrigger>Detailed diagram changes</AccordionTrigger>
              <AccordionContent>
                <ul className="flex list-disc flex-col gap-2 pl-5">
                  {review.changes?.model?.descriptions?.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
