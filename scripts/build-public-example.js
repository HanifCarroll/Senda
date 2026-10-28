import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openHostedProjects } from "../server/projects.js";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";

const directory = await mkdtemp(path.join(tmpdir(), "scribe-public-example-"));
const service = await openHostedProjects(directory),
  actor = { userId: "public-synthetic-example" };

// Keep the test fixture's provenance in its source files and technical docs.
// The public example uses concise labels while retaining evidence line IDs.
const sourceTitles = {
  Source_Transcript: "Onboarding interview",
  Policy: "Earlier onboarding checklist",
  Round1: "Round 1: normal flow and parallel work",
  Round2: "Round 2: reminders, deadlines and withdrawal",
  Round3: "Round 3: variants, rework and completion",
};
function exampleSource(source) {
  const title = sourceTitles[source.id] || source.title;
  const text = (source.id === "Policy"
    ? source.text.replace(/^SYNTHETIC HISTORICAL DOCUMENT\. /, "")
      .replace(/ This excerpt is intentionally included.*$/, "")
    : source.text.replace(/^SYNTHETIC[^\n]*/, title))
    .replace(" This is a synthetic description of the current process for training, not evidence that a real process owner has validated the diagram.", "");
  return {
    ...source, title, text,
    origin: "Client onboarding example",
    contributor: "Brightline process team",
    period: source.kind === "document" ? "Earlier onboarding policy" : "Current process",
    coverage: "Onboarding interview and clarification answers",
  };
}

try {
  const { proposals, texts } = await onboardingProposals();
  const project = await service.create(actor, {
    name: "Brightline client onboarding",
    purpose: "Map client onboarding, clarify decisions and review the revised process",
    perspective: "Brightline Studio",
    source: exampleSource({
      id: "Source_Transcript",
      kind: "transcript",
      text: texts.Source_Transcript,
    }),
  });
  await mkdir(new URL("../public/examples/", import.meta.url), { recursive: true });
  for (const [i, proposal] of proposals.entries()) {
    proposal.sources = proposal.sources?.map(exampleSource);
    if (proposal.context) {
      if (proposal.context.purpose) proposal.context.purpose = "Train a new coordinator on the current onboarding process.";
      if (proposal.context.scopeNotes) proposal.context.scopeNotes = proposal.context.scopeNotes
        .replace(/^SYNTHETIC WORKFLOW TEST\. /, "")
        .replace(" Empty subprocesses are discovery gaps, not approved abstractions.", "");
    }
    proposal.stakeholders = proposal.stakeholders?.map(({ notes, ...stakeholder }) => stakeholder);
    await service.apply(actor, project.id, proposal);
    if (i === 0 || i === 3) {
      const review = await service.review(actor, project.id);
      review.id = "public-onboarding-example";
      review.history = review.history.map((h) => ({
        ...h,
        processKey: "public-onboarding-example",
        contentKey: `example:${h.revision}`,
      }));
      await writeFile(
        new URL(
          `../public/examples/onboarding-${i === 0 ? "draft" : "final"}.json`,
          import.meta.url,
        ),
        JSON.stringify(review),
      );
    }
  }
  console.log("Built public synthetic onboarding example: draft and revised model.");
} finally {
  service.close();
  await rm(directory, { recursive: true, force: true });
}
