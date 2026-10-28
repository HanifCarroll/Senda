import { ArrowRight, FileText, X } from "lucide-react";
import type { ModelElement, Review } from "@/lib/types";
import { readableLabel } from "@/lib/review-navigation";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { AgentRequest } from "./agent-request";

export function EvidencePanel({
  element,
  review,
  onGo,
  onSource,
  onQuestions,
  onClose,
}: {
  element: ModelElement;
  review: Review;
  onGo: (id: string) => void;
  onSource: (sourceId: string, segmentId: string) => void;
  onQuestions: () => void;
  onClose?: () => void;
}) {
  const label = (id: string) =>
    readableLabel(review.elements.find((e) => e.id === id));
  return (
    <Card
      className="evidence-card h-full min-w-0 gap-0"
      aria-label="Element details"
    >
      <CardHeader className="pb-3">
        <CardDescription>Selected step</CardDescription>
        <CardTitle>{readableLabel(element)}</CardTitle>
        {onClose ? (
          <CardAction>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Hide evidence"
              onClick={onClose}
            >
              <X />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="flex flex-col gap-5 py-4">
          <AgentRequest
            key={`${review.modelKind || "as-is"}:${element.id}`}
            title="Request a correction"
            prompt={`Please update the ${review.modelKind === "to-be" ? "future" : "current"} process for “${review.title}”. I’m looking at version ${review.revision}.

The step “${readableLabel(element)}” needs a correction:
[Describe what should change and why.]

Ask me about anything unclear, then show me the updated diagram.`}
          />
          {element.source && element.target ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">Message or connection</p>
              <Button
                variant="outline"
                className="h-auto justify-start whitespace-normal py-2 text-left"
                onClick={() => onGo(element.source!)}
              >
                From: {label(element.source)}
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start whitespace-normal py-2 text-left"
                onClick={() => onGo(element.target!)}
              >
                To: {label(element.target)}
              </Button>
            </div>
          ) : null}
          {review.views.some((v) => v.elementId === element.id) ? (
            <Button variant="outline" onClick={() => onGo(element.id)}>
              Explore this part
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : null}
          {element.claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No supporting statement is linked to this element yet.
            </p>
          ) : (
            element.claims.map((claim, i) => (
              <section key={i} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">Model interpretation</h3>
                  <Badge variant="secondary">{claim.status}</Badge>
                </div>
                <p className="text-sm leading-relaxed">{claim.statement}</p>
                {claim.evidence.length ? (
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Source passages
                  </h4>
                ) : null}
                {claim.evidence.map((e, j) => (
                  <blockquote
                    key={j}
                    className="rounded-md border-l-2 border-primary/30 bg-muted/50 p-3 text-sm leading-relaxed"
                  >
                    <p>{e.quote}</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2 h-auto max-w-full justify-start whitespace-normal p-0 text-left"
                      onClick={() => onSource(e.sourceId, e.segmentId)}
                    >
                      <FileText data-icon="inline-start" />
                      {e.sourceTitle}
                    </Button>
                  </blockquote>
                ))}
              </section>
            ))
          )}
          {element.questions.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Related clarifications</h3>
              {element.questions.map((q) => (
                <Button
                  key={q.id}
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  onClick={onQuestions}
                >
                  {q.question}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
