import type { DiagramView, ModelElement, ReviewChoice } from "./types";

// Use the same destination for the preview label and the actual navigation.
export function destinationFor(views: DiagramView[], id: string) {
  return views.find((v) => v.elementId === id) ||
    views.find((v) => v.elementIds.includes(id) && !v.contextIds.includes(id));
}

export function readableLabel(element?: ModelElement) {
  if (!element) return "Show this step";
  if (element.type.includes("Gateway")) {
    const previous = element.label.split(" after ")[1];
    if (element.type === "ParallelGateway")
      return previous ? `Parallel work: ${previous}` : "Parallel work";
    return previous ? `Decision: ${previous}` : "Decision";
  }
  return element.label;
}

export function processGroups(reviews: ReviewChoice[]) {
  const groups = new Map<
    string,
    { key: string; title: string; versions: ReviewChoice[] }
  >();
  for (const review of reviews) {
    let group = groups.get(review.processKey);
    if (!group) {
      group = { key: review.processKey, title: review.title, versions: [] };
      groups.set(review.processKey, group);
    }
    // Exact copies share one visible version. A URL to any copy still opens it.
    if (
      !group.versions.some(
        (v) =>
          v.contentKey === review.contentKey && v.revision === review.revision,
      )
    )
      group.versions.push(review);
  }
  for (const group of groups.values())
    group.versions.sort(
      (a, b) =>
        b.revision - a.revision ||
        (b.created || "").localeCompare(a.created || "") ||
        b.modified - a.modified,
    );
  return [...groups.values()];
}

export function versionDate(review: ReviewChoice) {
  if (!review.created) return "Date unavailable";
  return (
    new Date(review.created).toISOString().slice(0, 16).replace("T", " ") +
    " UTC"
  );
}
