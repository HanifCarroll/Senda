import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Maximize,
  Minimize,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  PanelRight,
  Info,
  Crosshair,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import type {
  Review,
  ReviewChoice,
  ReviewLocation,
  Section,
} from "@/lib/types";
import { destinationFor, readableLabel } from "@/lib/review-navigation";
import { cn } from "@/lib/utils";
import { DiagramCanvas, type CanvasControls } from "./diagram-canvas";
import { BrandMark } from "./brand";
import { EvidencePanel } from "./evidence-panel";
import { RevisionPicker } from "./revision-picker";
import {
  Clarifications,
  Sources,
  SourcePassage,
  Walkthrough,
  ReviewChecks,
} from "./review-records";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Input } from "./ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Field, FieldLabel, FieldGroup } from "./ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "./ui/breadcrumb";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "./ui/dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./ui/resizable";
import { Toaster } from "./ui/sonner";

const sections: { id: Section; label: string }[] = [
  { id: "diagram", label: "Diagram" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "questions", label: "Clarifications" },
  { id: "sources", label: "Sources" },
  { id: "checks", label: "Review checks" },
];
function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReviewApp({
  review,
  reviews,
  location,
  updateLocation,
  changeReview,
  refresh,
  revisionId,
  onAnswer,
  embedded = false,
}: {
  review: Review;
  reviews: ReviewChoice[];
  location: ReviewLocation;
  updateLocation: (patch: ReviewLocation) => Promise<void>;
  changeReview: (id: string) => void;
  refresh: () => void;
  revisionId?: string;
  onAnswer?: (id: string) => void;
  embedded?: boolean;
}) {
  const [focusRequest, setFocusRequest] = useState(0);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(100);
  const [inspecting, setInspecting] = useState(false);
  const [mobileEvidence, setMobileEvidence] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [sourceIds, setSourceIds] = useState<string[]>(
    location.source ? [location.source] : [],
  );
  const canvas = useRef<CanvasControls>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const tab = location.section || "diagram";
  const view =
    review.views.find((v) => v.elementId === location.view) || review.views[0];
  const catalog = useMemo(
    () => new Map(review.elements.map((e) => [e.id, e])),
    [review.elements],
  );
  const selected = location.element ? catalog.get(location.element) : undefined;
  const breadcrumbs = [];
  for (
    let v = view;
    v;
    v = review.views.find((p) => p.elementId === v.parentId)!
  )
    breadcrumbs.unshift(v);
  const found = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term
      ? review.elements
          .filter(
            (e) =>
              e.label.toLocaleLowerCase().includes(term) ||
              readableLabel(e).toLocaleLowerCase().includes(term),
          )
          .sort(
            (a, b) =>
              Number(b.label.toLocaleLowerCase() === term) -
                Number(a.label.toLocaleLowerCase() === term) ||
              Number(!!a.source) - Number(!!b.source),
          )
          .slice(0, 12)
      : [];
  }, [search, review.elements]);
  useEffect(() => {
    const query = matchMedia("(max-width: 1023px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded]);
  useEffect(() => {
    if (tab !== "sources" || !location.source || !location.segment) return;
    setSourceIds((ids) => [...new Set([...ids, location.source!])]);
    const timer = setTimeout(
      () =>
        document
          .getElementById(`source-${location.source}-${location.segment}`)
          ?.scrollIntoView({ block: "center" }),
      180,
    );
    return () => clearTimeout(timer);
  }, [tab, location.source, location.segment]);
  function changeTab(section: Section) {
    setExpanded(false);
    updateLocation({ section, source: undefined, segment: undefined });
  }
  function showView(id: string) {
    updateLocation({
      view: id,
      element: undefined,
      section: "diagram",
      source: undefined,
      segment: undefined,
    });
    setSearch("");
    setInspecting(false);
    setFocusRequest(0);
  }
  async function go(id: string) {
    const destination = destinationFor(review.views, id);
    await updateLocation({
      view: destination?.elementId || view?.elementId,
      element: id,
      section: "diagram",
      source: undefined,
      segment: undefined,
    });
    setFocusRequest((n) => n + 1);
    setSearch("");
    setMobileEvidence(!destination);
    if (!destination) setInspecting(true);
  }
  function select(id: string) {
    if (review.views.some((v) => v.elementId === id)) {
      showView(id);
      return;
    }
    updateLocation({ element: id, view: view.elementId });
  }
  function source(id: string, segment: string) {
    setMobileEvidence(false);
    setSourceIds((ids) => [...new Set([...ids, id])]);
    updateLocation({ source: id, segment });
  }
  function returnToDiagram() {
    updateLocation({
      section: "diagram",
      source: undefined,
      segment: undefined,
    });
  }
  const openQuestions = review.discovery.questions.filter(
    (q) => q.status !== "answered",
  ).length;
  const evidence = selected ? (
    <EvidencePanel
      element={selected}
      review={review}
      onGo={go}
      onSource={source}
      onQuestions={() => changeTab("questions")}
      onClose={mobile ? undefined : () => setInspecting(false)}
    />
  ) : null;
  const sourceOpen = !!location.source && tab !== "sources";
  const Heading = embedded ? "h2" : "h1";
  return (
    <TooltipProvider>
      <div
        className={cn("review-shell min-h-screen", expanded && "focus-mode")}
      >
        <header className="app-header border-b bg-card">
          <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-3 sm:px-6">
            <a
              href="/"
              aria-label="Senda home"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background"
            >
              <BrandMark />
            </a>
            <div className="min-w-0 flex-1">
              <Heading className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {review.title}
              </Heading>
              <p className="text-xs text-muted-foreground">
                Revision {review.revision} ·{" "}
                {review.modelKind === "to-be"
                  ? "To-be · Planning draft"
                  : review.modelKind === "as-is"
                    ? "As-is · Current process"
                    : review.quality.readyToFinalize
                      ? "Ready for handover"
                      : "Draft for review"}
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Process context"
                >
                  <Info />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Process context</DialogTitle>
                  <DialogDescription>
                    {review.discovery.context.purpose}
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm leading-relaxed">
                  {review.discovery.context.scopeNotes}
                </p>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh reviews"
              onClick={refresh}
            >
              <RefreshCw />
            </Button>
            <Button
              onClick={() =>
                download(
                  review.exportXml,
                  review.exportFilename || "model.bpmn",
                  "application/xml",
                )
              }
              aria-label="Download BPMN"
            >
              <Download data-icon="inline-start" />
              <span className="hidden sm:inline">Download BPMN</span>
            </Button>
          </div>
        </header>
        <main className="review-main mx-auto flex max-w-[1800px] flex-col gap-3 px-3 py-3 sm:px-6">
          <Tabs
            value={tab}
            onValueChange={(value) => changeTab(value as Section)}
            className="gap-3"
          >
            <div className="library-navigation flex flex-wrap items-center justify-between gap-3">
              <RevisionPicker
                reviews={reviews}
                selectedId={revisionId || review.id}
                onChange={changeReview}
              />
              <TabsList variant="line" className="hidden lg:inline-flex">
                {sections.map((s) => (
                  <TabsTrigger key={s.id} value={s.id}>
                    {s.label}
                    {s.id === "questions" && openQuestions
                      ? ` (${openQuestions})`
                      : ""}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="w-full lg:hidden">
                <Select
                  value={tab}
                  onValueChange={(value) => changeTab(value as Section)}
                >
                  <SelectTrigger aria-label="Review section" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                          {s.id === "questions" && openQuestions
                            ? ` (${openQuestions})`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <TabsContent
              value="diagram"
              forceMount
              className={cn(
                "flex flex-col gap-3",
                tab !== "diagram" && "hidden",
              )}
            >
              {!view ? (
                <Card>
                  <CardHeader>
                    <CardTitle>No diagram yet</CardTitle>
                    <CardDescription>
                      Add the first process steps to see them here.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                <>
                  <div className="diagram-breadcrumbs flex flex-wrap items-center justify-between gap-2">
                    <Breadcrumb>
                      <BreadcrumbList>
                        {breadcrumbs.map((b, i) => (
                          <Fragment key={b.elementId}>
                            {i ? <BreadcrumbSeparator /> : null}
                            <BreadcrumbItem>
                              {b.elementId === view.elementId ? (
                                <BreadcrumbPage>{b.title}</BreadcrumbPage>
                              ) : (
                                <BreadcrumbLink asChild>
                                  <button onClick={() => showView(b.elementId)}>
                                    {b.title}
                                  </button>
                                </BreadcrumbLink>
                              )}
                            </BreadcrumbItem>
                          </Fragment>
                        ))}
                      </BreadcrumbList>
                    </Breadcrumb>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {review.quality.rendering.drawnMessages}/
                      {review.quality.rendering.totalMessages} message exchanges
                      shown
                    </span>
                  </div>
                  <FieldGroup className="view-controls grid gap-2 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="view-choice" className="sr-only">
                        View
                      </FieldLabel>
                      <Select value={view.elementId} onValueChange={showView}>
                        <SelectTrigger id="view-choice" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectGroup>
                            {review.views.map((v) => (
                              <SelectItem key={v.elementId} value={v.elementId}>
                                {v.title}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="element-search" className="sr-only">
                        Find a step or message
                      </FieldLabel>
                      <Input
                        id="element-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find a step or message…"
                        type="search"
                      />
                    </Field>
                  </FieldGroup>
                  {search.trim() ? (
                    <Card className="search-results">
                      <CardContent
                        className="flex flex-col gap-2"
                        aria-live="polite"
                      >
                        {found.length ? (
                          found.map((e) => (
                            <Button
                              key={e.id}
                              variant="ghost"
                              className="h-auto justify-start whitespace-normal py-2 text-left"
                              onClick={() => go(e.id)}
                            >
                              {readableLabel(e)}
                              <Badge variant="outline">
                                {e.source ? "Connection" : "Step"}
                              </Badge>
                            </Button>
                          ))
                        ) : (
                          <p>No matching steps or messages.</p>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                  <div ref={workspace} className="diagram-workspace">
                    <ResizablePanelGroup
                      orientation="horizontal"
                      className="workspace-panels"
                    >
                      <ResizablePanel
                        id="diagram"
                        minSize="35%"
                        defaultSize="72%"
                      >
                        <Card className="canvas-card min-w-0 gap-0 py-0">
                          <div
                            className="canvas-toolbar flex flex-wrap items-center justify-between gap-2 border-b p-2"
                            role="toolbar"
                            aria-label="Diagram controls"
                          >
                            <div className="flex min-w-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Parent view"
                                disabled={!view.parentId}
                                onClick={() =>
                                  view.parentId && showView(view.parentId)
                                }
                              >
                                <ArrowLeft />
                              </Button>
                              <h2 className="truncate text-sm font-medium">
                                {view.title}
                              </h2>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Zoom out"
                                onClick={() => canvas.current?.zoom(1 / 1.2)}
                              >
                                <Minus />
                              </Button>
                              <output
                                className="min-w-10 text-center text-xs tabular-nums"
                                aria-label="Zoom level"
                              >
                                {zoom}%
                              </output>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Zoom in"
                                onClick={() => canvas.current?.zoom(1.2)}
                              >
                                <Plus />
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => canvas.current?.fit()}
                              >
                                Fit
                              </Button>
                              <Button
                                variant="ghost"
                                title="Read labels at actual size"
                                onClick={() => canvas.current?.actual()}
                              >
                                100%
                              </Button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={
                                      expanded
                                        ? "Exit expanded view"
                                        : "Expand diagram"
                                    }
                                    onClick={() =>
                                      setExpanded((value) => !value)
                                    }
                                  >
                                    {expanded ? <Minimize /> : <Maximize />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {expanded
                                    ? "Exit expanded view"
                                    : "Expand diagram"}
                                </TooltipContent>
                              </Tooltip>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Download this view"
                                    title="Download this view"
                                  >
                                    <Download />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>
                                      Download this view
                                    </DialogTitle>
                                    <DialogDescription>
                                      Only “{view.title}”, with its visible
                                      outside participants. Use Download BPMN in
                                      the page header for the complete process.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogClose asChild>
                                    <Button
                                      onClick={() =>
                                        download(
                                          view.bpmnXml,
                                          view.bpmnFile,
                                          "application/xml",
                                        )
                                      }
                                    >
                                      <Download data-icon="inline-start" />
                                      BPMN view
                                    </Button>
                                  </DialogClose>
                                  <DialogClose asChild>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        download(
                                          view.svg,
                                          view.file,
                                          "image/svg+xml",
                                        )
                                      }
                                    >
                                      SVG image
                                    </Button>
                                  </DialogClose>
                                </DialogContent>
                              </Dialog>
                              {selected ? (
                                <Button
                                  variant="outline"
                                  aria-label={
                                    mobile
                                      ? "View evidence"
                                      : inspecting
                                        ? "Hide evidence"
                                        : "Show evidence"
                                  }
                                  onClick={() =>
                                    mobile
                                      ? setMobileEvidence(true)
                                      : setInspecting((value) => !value)
                                  }
                                >
                                  <PanelRight data-icon="inline-start" />
                                  <span className="hidden sm:inline">
                                    Evidence
                                  </span>
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <DiagramCanvas
                            view={view}
                            elements={review.elements}
                            selected={selected?.id}
                            focusRequest={focusRequest}
                            storageKey={review.id}
                            onSelect={select}
                            onZoom={setZoom}
                            ref={canvas}
                          />
                          <div className="canvas-help flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
                            <span>
                              Drag to pan · Select a step, then open Evidence
                            </span>
                            {selected && mobile ? (
                              <Button
                                variant="outline"
                                onClick={() => setMobileEvidence(true)}
                              >
                                View evidence
                              </Button>
                            ) : null}
                          </div>
                        </Card>
                      </ResizablePanel>
                      {selected && inspecting && !mobile ? (
                        <>
                          <ResizableHandle
                            withHandle
                            aria-label="Resize evidence panel"
                          />
                          <ResizablePanel
                            id="evidence"
                            minSize="240px"
                            maxSize="55%"
                            defaultSize="28%"
                          >
                            {evidence}
                          </ResizablePanel>
                        </>
                      ) : null}
                    </ResizablePanelGroup>
                  </div>
                  {view.inheritedEventIds.length ? (
                    <div className="context-events flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Also applies here
                      </span>
                      {view.inheritedEventIds.map((id) => (
                        <Button
                          key={id}
                          variant="outline"
                          size="sm"
                          onClick={() => go(id)}
                        >
                          {catalog.get(id)?.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="child-views flex flex-wrap gap-2">
                    {view.childIds.map((id) => (
                      <Button
                        key={id}
                        variant="outline"
                        className="h-auto justify-start whitespace-normal py-3 text-left"
                        onClick={() => showView(id)}
                      >
                        <Layers data-icon="inline-start" />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span>{review.views.find((v) => v.elementId === id)?.title}</span>
                          <span className="text-xs text-muted-foreground">Open subprocess</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                  <Card className="messages-panel">
                    <CardContent>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="messages" className="border-0">
                          <AccordionTrigger>
                            <span className="flex items-center gap-2">
                              <MessageSquare className="size-4" />
                              Messages in this part (
                              {view.relatedMessageIds.length})
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="mb-3 text-sm text-muted-foreground">
                              Each message shows where it will open. Messages in this diagram are brought into focus.
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {view.relatedMessageIds.map((id) => {
                                const destination = destinationFor(review.views, id);
                                const here = destination?.elementId === view.elementId;
                                const action = here ? "Show in this diagram" : destination
                                  ? `Open ${destination.parentId ? "subprocess" : "diagram"}: ${destination.title}`
                                  : "View evidence · diagram unavailable";
                                const Icon = here ? Crosshair : destination?.parentId ? Layers : destination ? ArrowUpRight : Info;
                                return (
                                <Button
                                  key={id}
                                  variant="outline"
                                  className="h-auto justify-start whitespace-normal py-3 text-left"
                                  data-message-id={id}
                                  onClick={() => go(id)}
                                >
                                  <span className="flex min-w-0 flex-col gap-1">
                                    <span>{catalog.get(id)?.label}</span>
                                    <span className="flex items-start gap-2 text-xs text-muted-foreground">
                                      <Icon data-icon="inline-start" className="mt-0.5" aria-hidden="true" />
                                      <span>{action}</span>
                                    </span>
                                  </span>
                                </Button>
                                );
                              })}
                              {!view.relatedMessageIds.length ? (
                                <p>
                                  No message exchanges are linked to this part.
                                </p>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
            <TabsContent value="walkthrough">
              <Walkthrough review={review} onGo={go} />
            </TabsContent>
            <TabsContent value="questions">
              <Clarifications
                review={review}
                onSource={source}
                onGo={go}
                onAnswer={onAnswer}
              />
            </TabsContent>
            <TabsContent value="sources">
              <Sources
                review={review}
                selected={sourceIds}
                setSelected={setSourceIds}
                segment={
                  location.source && location.segment
                    ? `${location.source}-${location.segment}`
                    : undefined
                }
                onReturn={returnToDiagram}
              />
            </TabsContent>
            <TabsContent value="checks">
              <ReviewChecks
                review={review}
                onQuestions={() => changeTab("questions")}
                onGo={go}
                onView={showView}
              />
            </TabsContent>
          </Tabs>
          <Sheet
            open={mobileEvidence && mobile}
            onOpenChange={setMobileEvidence}
          >
            <SheetContent
              side="bottom"
              className="data-[side=bottom]:h-[85dvh]"
            >
              <SheetHeader>
                <SheetTitle>Step evidence</SheetTitle>
                <SheetDescription>
                  Supporting statements and source passages for the selected
                  step.
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 px-3 pb-3">{evidence}</div>
            </SheetContent>
          </Sheet>
          <Sheet
            open={sourceOpen}
            modal={mobile}
            onOpenChange={(open) => {
              if (!open)
                updateLocation({ source: undefined, segment: undefined });
            }}
          >
            <SheetContent
              side={mobile ? "bottom" : "right"}
              className="data-[side=bottom]:h-[85dvh] sm:max-w-xl"
            >
              <SheetHeader>
                <SheetTitle>Original source passage</SheetTitle>
                <SheetDescription>
                  Read the evidence while keeping your place in the diagram.
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SourcePassage
                  review={review}
                  sourceId={location.source}
                  segmentId={location.segment}
                />
              </div>
              <div className="border-t p-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={returnToDiagram}
                >
                  <ArrowLeft data-icon="inline-start" />
                  Return to diagram
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <p className="sr-only" role="status">
            {selected
              ? `${readableLabel(selected)} selected. View its supporting evidence.`
              : view?.title}
          </p>
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
