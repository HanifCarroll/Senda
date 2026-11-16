import { useRef, useState } from "react";
import type { Review } from "@/lib/types";
import { DiagramCanvas, ZoomControls, type CanvasControls } from "./diagram-canvas";
import { EvidencePanel } from "./evidence-panel";
import { SourcePassage } from "./review-records";
import { Card } from "./ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

// The home page's live example: one view of the public example in the app's own canvas and evidence panel.
// The selection is local state, so selecting a step never navigates or changes the URL.
// The home page loads this file and the example's data only when the section comes near the viewport.
const viewId = "Intake";
// The steps the selected step's passage describes, at the zoom that shows the diagram's 11 px labels at 12 px.
const frame = { ids: ["CheckPack", "PackDecision", "RequestItems", "WaitPack", "IntakeEnd"], scale: 1.1 };

export function EvidenceDemo({ review }: { review: Review }) {
  const view = review.views.find((v) => v.elementId === viewId) ?? review.views[0];
  const [selectedId, setSelectedId] = useState(frame.ids[0]);
  const [focusRequest, setFocusRequest] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [passage, setPassage] = useState<{ source: string; segment: string }>();
  const canvas = useRef<CanvasControls>(null);
  const selected = review.elements.find((e) => e.id === selectedId);
  return (
    <div className="evidence-demo grid gap-2 lg:h-full lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)]">
      <Card className="canvas-card min-w-0 gap-0 py-0">
        <div className="canvas-toolbar flex items-center justify-end gap-2 border-b p-2 sm:justify-between" role="toolbar" aria-label="Diagram controls">
          <span className="truncate px-2 text-sm font-medium max-sm:hidden">{view.title}</span>
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
          onSelect={setSelectedId}
          onZoom={setZoom}
          frame={frame}
          ref={canvas}
        />
        <p className="canvas-help border-t px-3 py-2 text-xs text-muted-foreground">Drag to pan · Select a step to read its evidence</p>
      </Card>
      {selected && (
        <EvidencePanel
          element={selected}
          review={review}
          onGo={(id) => {
            // Only this view is shown, so a step in another view keeps the selection where it is.
            if (!view.elementIds.includes(id) && !view.contextIds.includes(id)) return;
            setSelectedId(id);
            setFocusRequest((n) => n + 1);
          }}
          onSource={(source, segment) => setPassage({ source, segment })}
          onQuestions={() => {}}
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
