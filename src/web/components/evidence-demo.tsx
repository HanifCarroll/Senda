import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DiagramView, ModelElement, Review } from "@/lib/types";
import { DiagramCanvas, ZoomControls, type CanvasControls } from "./diagram-canvas";
import { EvidencePanel } from "./evidence-panel";
import { SourcePassage } from "./review-records";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

// The home page's live example: the first draft's main view in the app's own canvas and evidence panel.
// The selection is local state, so selecting a step never navigates or changes the URL.
// The home page loads this file and the example's data only when the section comes near the viewport.
// The selected step first, then the view's other steps, at the zoom that shows the diagram's 11 px labels at 12 px.
const frame = { ids: ["Intake", "Readiness", "SendHandover", "Kickoff", "Workspace"], scale: 1.1 };

// The view's steps in process order: from the first step along the sequence flows, then each other chain
// of steps from its own first step, in the order the view lists them.
export function stepOrder(view: DiagramView, elements: ModelElement[], first: string) {
  const inView = elements.filter((e) => view.elementIds.includes(e.id));
  const steps = inView.filter((e) => /(Task|SubProcess|CallActivity)$/.test(e.type)).map((e) => e.id);
  const flows = inView.filter((e) => e.type === "SequenceFlow" && e.source && e.target);
  const order: string[] = [];
  const walk = (id: string) => {
    if (!steps.includes(id) || order.includes(id)) return;
    order.push(id);
    for (const flow of flows) if (flow.source === id) walk(flow.target!);
  };
  walk(first);
  for (const id of steps) if (!flows.some((flow) => flow.target === id && steps.includes(flow.source!))) walk(id);
  steps.forEach(walk);
  return order;
}

export function EvidenceDemo({ review: example }: { review: Review }) {
  const view = example.views[0];
  // Only this view is shown, so a subprocess is a step with evidence here, not a view to open: the panel
  // offers "Explore this part" only for a view it is given. Its questions are text, with no list to open.
  const review = useMemo(() => ({ ...example, views: [view] }), [example, view]);
  const canvas = useRef<CanvasControls>(null);
  const [selectedId, setSelectedId] = useState(frame.ids[0]);
  const steps = useMemo(() => stepOrder(view, review.elements, frame.ids[0]), [view, review]);
  // The step the controls under the diagram count from. Selecting a pool, a flow or the start event leaves
  // it on the last step selected, so the label and the buttons carry on from there.
  const [step, setStep] = useState(0);
  const select = (id: string) => {
    setSelectedId(id);
    if (steps.includes(id)) setStep(steps.indexOf(id));
  };
  const go = (index: number) => {
    if (!steps[index]) return;
    select(steps[index]);
    canvas.current?.show(steps[index]);
  };
  const [focusRequest, setFocusRequest] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [passage, setPassage] = useState<{ source: string; segment: string }>();
  const selected = review.elements.find((e) => e.id === selectedId);
  return (
    <div className="evidence-demo grid h-full grid-rows-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)]">
      <Card className="canvas-card min-w-0 gap-0 py-0">
        <div className="canvas-toolbar flex items-center justify-end gap-2 border-b p-2 sm:justify-between" role="toolbar" aria-label="Diagram controls">
          <span className="truncate px-2 text-sm font-medium max-sm:hidden">Process overview</span>
          <div className="flex items-center gap-1">
            <ZoomControls canvas={canvas} zoom={zoom} />
          </div>
        </div>
        <DiagramCanvas
          view={view}
          elements={review.elements}
          selected={selectedId}
          focusRequest={focusRequest}
          storageKey="home-demo"
          onSelect={select}
          onZoom={setZoom}
          frame={frame}
          ref={canvas}
        />
        {/* Below lg the example is at most 350 px wide, which never holds all the steps at this zoom, so
            these buttons bring each step into view. From lg up every step is in view and they are hidden. */}
        <div className="step-controls flex items-center gap-1 border-t p-1 lg:hidden">
          {/* aria-disabled, not disabled, so a button keeps the keyboard focus when it reaches its end. */}
          <Button variant="ghost" size="icon" aria-label="Previous step" aria-disabled={step === 0} className="aria-disabled:opacity-50" onClick={() => go(step - 1)}>
            <ChevronLeft />
          </Button>
          <p aria-live="polite" aria-atomic="true" className="flex min-h-10 min-w-0 flex-1 items-center justify-center text-center text-sm leading-5 text-balance">
            Step {step + 1} of {steps.length} · {review.elements.find((e) => e.id === steps[step])?.label}
          </p>
          <Button variant="ghost" size="icon" aria-label="Next step" aria-disabled={step === steps.length - 1} className="aria-disabled:opacity-50" onClick={() => go(step + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <p className="canvas-help border-t px-3 py-2 text-xs text-muted-foreground">Drag to pan · Select a step to read its evidence</p>
      </Card>
      {selected && (
        <EvidencePanel
          element={selected}
          review={review}
          onGo={(id) => {
            // Only this view is shown, so a step in another view keeps the selection where it is.
            if (!view.elementIds.includes(id) && !view.contextIds.includes(id)) return;
            select(id);
            setFocusRequest((n) => n + 1);
          }}
          onSource={(source, segment) => setPassage({ source, segment })}
        />
      )}
      <Sheet open={!!passage} onOpenChange={(open) => !open && setPassage(undefined)}>
        <SheetContent side={matchMedia("(max-width: 1023px)").matches ? "bottom" : "right"} className="data-[side=bottom]:h-[85dvh] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Original source passage</SheetTitle>
            <SheetDescription>Read the evidence while keeping your place in the diagram.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SourcePassage review={review} sourceId={passage?.source} segmentId={passage?.segment} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
