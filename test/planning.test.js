import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openHostedProjects } from "../src/server/projects.js";
import { onboardingProposals } from "../examples/complex-onboarding/proposals.js";
import { contentHash } from "../src/core/store.js";

test("planning preserves a pinned baseline across concurrent creation, As-is edits and reopening", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "senda-plan-"));
  let service = await openHostedProjects(directory);
  const actor = { userId: "synthetic-owner" };
  try {
    const { proposals, texts } = await onboardingProposals();
    const p = await service.create(actor, {
      name: "Independent model histories",
      purpose: "Review onboarding",
      perspective: "Brightline",
      source: {
        id: "Source_Transcript",
        title: "Synthetic interview",
        kind: "transcript",
        text: texts.Source_Transcript,
      },
    });
    await assert.rejects(
      service.createToBe(actor, p.id, {
        baselineRevision: 1,
        brief: "Plan a different invoice check.",
      }),
      (e) => e.code === "INVALID_REQUEST",
    );
    await service.apply(actor, p.id, proposals[0]);
    const baseline = await service.withProject(actor, p.id, (p) => p.read());
    const inputs = {
      baselineRevision: 2,
      brief:
        "Plan a different invoice check. Keep other steps unchanged for now.",
    };
    const race = await Promise.allSettled([
      service.createToBe(actor, p.id, inputs),
      service.createToBe(actor, p.id, inputs),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      race.find((r) => r.status === "rejected").reason.code,
      "MODEL_EXISTS",
    );
    assert.equal(
      (await readdir(path.join(directory, "projects"))).length,
      2,
      "losing creation cleans up only its own fresh directory",
    );
    const planned = await service.withProject(
      actor,
      p.id,
      (p) => p.read(),
      "to-be",
    );
    assert.equal(planned.xml, baseline.xml);
    assert.equal(planned.mode, "proposed");
    for (const field of [
      "claims",
      "questions",
      "scenarios",
      "conflicts",
      "stakeholders",
      "abstractions",
    ])
      assert.deepEqual(planned.discovery[field], []);
    assert.deepEqual(planned.reviews, {});
    assert.deepEqual(planned.scenarioReviews, {});
    assert.deepEqual(
      planned.discovery.sources.map((s) => s.id),
      ["Design_Brief"],
    );
    assert.deepEqual(
      await service.withProject(actor, p.id, (p) => p.read()),
      baseline,
    );
    await service.apply(actor, p.id, proposals[1]);
    assert.deepEqual(
      await service.withProject(actor, p.id, (p) => p.read(), "to-be"),
      planned,
    );
    const models = await service.models(actor, p.id);
    assert.equal(models.asIs.revision, 3);
    assert.equal(models.toBe.baseline.revision, 2);
    assert.equal(models.toBe.baseline.digest, contentHash(baseline));
    service.close();
    service = await openHostedProjects(directory);
    assert.deepEqual(await service.models(actor, p.id), models);
    assert.deepEqual(
      await service.withProject(actor, p.id, (p) => p.read(), "to-be"),
      planned,
    );
    await assert.rejects(
      service.read({ userId: "another-owner" }, p.id, undefined, "to-be"),
      (e) => e.code === "NOT_FOUND",
    );
    await assert.rejects(service.read(actor, p.id, undefined, "future"), {
      name: "ZodError",
    });
  } finally {
    service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
