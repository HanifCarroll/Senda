import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { post } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";

export type ModelKind = "as-is" | "to-be";
export interface Models {
  projectId: string;
  name: string;
  asIs: { revision: number; history: { revision: number; summary: string }[] };
  toBe: {
    revision: number;
    baseline: { revision: number; digest: string; created: string };
  } | null;
}
export function ModelNavigation({
  models,
  selected,
  onSelect,
  onCreated,
  onBaseline,
}: {
  models: Models;
  selected: ModelKind;
  onSelect: (model: ModelKind) => void;
  onCreated: () => Promise<void>;
  onBaseline: (revision: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [brief, setBrief] = useState(""),
    [baseline, setBaseline] = useState(String(models.asIs.revision)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post(`/api/projects/${models.projectId}/models`, {
        baselineRevision: Number(baseline),
        brief,
      });
      setOpen(false);
      setBrief("");
      await onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Process models"
      className="project-navigation mx-auto flex max-w-[1800px] flex-col gap-3 px-4 pb-4 sm:px-6"
    >
      <h1 className="text-lg font-semibold">{models.name}</h1>
      <Tabs
        value={selected}
        onValueChange={(value) => onSelect(value as ModelKind)}
      >
        <TabsList className="h-auto w-full sm:w-fit" aria-label="Process model">
          <TabsTrigger className="min-h-11 flex-1 px-5" value="as-is">
            As-is <span className="hidden sm:inline">· Current process</span>
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1 px-5" value="to-be">
            To-be <span className="hidden sm:inline">· Planned future</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={selected}>
          {selected === "as-is" ? (
            <p className="text-sm text-muted-foreground">
              How the process works today. Future changes have their own To-be
              model and history.
            </p>
          ) : models.toBe ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <Badge variant="secondary">Planned future</Badge>
              <span>
                Started from As-is revision {models.toBe.baseline.revision}.
              </span>
              <Button
                size="sm"
                variant="link"
                className="h-auto p-0"
                onClick={() => onBaseline(models.toBe!.baseline.revision)}
              >
                View original As-is <ArrowRight className="size-4" />
              </Button>
              {models.asIs.revision > models.toBe.baseline.revision && (
                <span className="w-full">
                  As-is now has revision {models.asIs.revision}. This plan keeps
                  its original starting point.
                </span>
              )}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="planning-notes" className="border-0">
                  <AccordionTrigger className="w-fit gap-2 py-1 text-xs text-muted-foreground">
                    About this planning draft
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 text-sm text-muted-foreground">
                    The initial diagram was copied from the selected As-is
                    revision. Review its steps against the design brief;
                    current-process claims and approvals stay with the As-is
                    model.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-5 sm:p-6">
              <h2 className="font-semibold">Plan the future process</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Start with a copy of an As-is diagram and describe what you want
                to change. Your agent can revise the plan through the same
                clarification and review workflow. Each model keeps its own
                sources and revision history.
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  setBaseline(String(models.asIs.revision));
                  setError("");
                  setOpen(true);
                }}
              >
                Create To-be model
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create a To-be model</DialogTitle>
            <DialogDescription>
              Copy a saved As-is diagram into a separate planning draft.
              Current-process claims and approvals stay with the As-is model.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="plan-baseline">
                Start from As-is revision
              </FieldLabel>
              <Select value={baseline} onValueChange={setBaseline}>
                <SelectTrigger id="plan-baseline" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[...models.asIs.history].reverse().map((h) => (
                      <SelectItem
                        value={String(h.revision)}
                        key={h.revision}
                        textValue={`Revision ${h.revision}`}
                      >{`Revision ${h.revision}${h.revision === models.asIs.revision ? " · Latest" : ""}`}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-brief">What should change?</FieldLabel>
              <Textarea
                id="plan-brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={6}
                required
                maxLength={50000}
                placeholder="Describe the intended changes, what should stay the same, and any decisions still to make."
              />
              <p className="text-xs text-muted-foreground">
                Saved as the design brief for your modeling agent.
              </p>
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !brief.trim()}>
              {busy ? "Creating…" : "Create planning draft"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
