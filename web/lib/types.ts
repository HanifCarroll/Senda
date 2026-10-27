export interface Evidence {
  sourceId: string;
  segmentId: string;
  sourceTitle: string;
  quote: string;
}
export interface ModelElement {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  source?: string;
  target?: string;
  viewIds: string[];
  abstraction?: { description?: string; reason?: string };
  claims: { statement: string; status: string; evidence: Evidence[] }[];
  questions: { id: string; question: string; status: string }[];
}
export interface DiagramView {
  elementId: string;
  title: string;
  parentId: string | null;
  childIds: string[];
  svg: string;
  file: string;
  bpmnFile: string;
  bpmnXml: string;
  width: number;
  height: number;
  elementIds: string[];
  contextIds: string[];
  inheritedEventIds: string[];
  messageIds: string[];
  relatedMessageIds: string[];
  layoutCounts: Record<string, number>;
  layoutBefore?: Record<string, number>;
  readabilityFindings?: { code: string; message: string; count: number; elementIds: string[] }[];
}
export interface Source {
  id: string;
  title: string;
  text: string;
  origin?: string;
  segments: { id: string; text: string }[];
}
export interface Question {
  id: string;
  question: string;
  status: string;
  why: string;
  elementIds?: string[];
  blocking?: boolean;
  answerSourceId?: string;
  answer?: { text?: string; sourceId?: string; segmentId?: string };
  answerEvidence?: Evidence[];
}
export interface Review {
  id: string;
  title: string;
  revision: number;
  mode: string;
  modelKind?: "as-is" | "to-be";
  exportFilename?: string;
  xml: string;
  exportXml: string;
  views: DiagramView[];
  elements: ModelElement[];
  discovery: {
    context: {
      purpose: string;
      trigger?: string;
      outcomes?: string[];
      scopeNotes?: string;
      owner?: string;
    };
    sources: Source[];
    questions: Question[];
    walkthrough?: {
      steps?: { id: string; text: string; elementIds: string[] }[];
      text?: string;
    };
    scenarios?: {
      id: string;
      title: string;
      given: string;
      expectedOutcome: string;
      path: string[];
    }[];
  };
  quality: {
    scenarios?: { id: string; review: { outcome?: string } | null }[];
    walkthrough?: { status: string };
    structural: { passed: boolean };
    readyToFinalize: boolean;
    rendering: {
      totalMessages: number;
      drawnMessages: number;
      missingMessageIds: string[];
    };
    blockers: { code: string; message: string }[];
  };
  changes: {
    summary?: string;
    model?: {
      descriptions?: string[];
      created?: string[];
      changed?: string[];
      removed?: string[];
    };
  } | null;
}
export interface ReviewChoice {
  id: string;
  label: string;
  title: string;
  processKey: string;
  contentKey: string;
  summary: string;
  created: string | null;
  perspective: string;
  revision: number;
  modified: number;
}
export type Section =
  | "diagram"
  | "walkthrough"
  | "questions"
  | "sources"
  | "checks";
export interface ReviewLocation {
  view?: string;
  element?: string;
  section?: Section;
  source?: string;
  segment?: string;
}
