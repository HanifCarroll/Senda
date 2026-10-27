import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openHostedProjects } from "../server/projects.js";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";

const directory = await mkdtemp(path.join(tmpdir(), "scribe-public-example-"));
const service = await openHostedProjects(directory),
  actor = { userId: "public-synthetic-example" };
try {
  const { proposals, texts } = await onboardingProposals();
  const project = await service.create(actor, {
    name: "Brightline client onboarding — synthetic example",
    purpose:
      "Understand the onboarding process through a fictional interview and scripted clarifications",
    perspective: "Brightline Studio",
    source: {
      id: "Source_Transcript",
      title: "Synthetic onboarding interview",
      kind: "transcript",
      text: texts.Source_Transcript,
    },
  });
  await mkdir(new URL("../public/examples/", import.meta.url), { recursive: true });
  for (const [i, proposal] of proposals.entries()) {
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
