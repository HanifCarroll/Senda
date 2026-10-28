import { z } from "zod";
import { schema } from "../src/project-core.js";
import { Proposal, SourceInput } from "../src/schema.js";
import { requireThat } from "../src/errors.js";

/** Shared model operations. Each adapter authorizes and opens storage in withProject. */
export class ProjectModels {
  checkSources(sources) {
    requireThat(
      sources.length <= 40 &&
        sources.reduce((n, s) => n + Buffer.byteLength(s.text || ""), 0) <= 1_000_000,
      "LIMIT",
      "Keep each model below 40 sources and 1 MB of source text.",
    );
  }

  async apply(actor, id, input, model = "as-is") {
    const proposal = Proposal.parse(input);
    requireThat(
      proposal.operations.length <= 500,
      "LIMIT",
      "Submit at most 500 model operations per revision.",
    );
    return this.withProject(actor, id, async (project) => {
      this.checkSources([...project.read().discovery.sources, ...proposal.sources]);
      return project.apply(proposal);
    }, model);
  }

  async addSource(actor, id, input, model = "as-is") {
    const data = z.strictObject({
      expectedRevision: z.number().int().positive(),
      source: SourceInput,
    }).parse(input);
    return this.apply(actor, id, {
      expectedRevision: data.expectedRevision,
      summary: `Add ${data.source.kind}: ${data.source.title}`,
      sources: [data.source],
    }, model);
  }

  async read(actor, id, revision, model = "as-is") {
    return this.withProject(actor, id, async (project) => ({
      ...(await project.inspect(revision)),
      modelKind: model,
      history: project.history(),
      schema: schema(),
    }), model, revision);
  }

  async sources(actor, id, model = "as-is") {
    return this.withProject(actor, id, (project) => project.read().discovery.sources, model);
  }

  async questions(actor, id, model = "as-is") {
    return this.withProject(actor, id, (project) => {
      const snapshot = project.read();
      return { revision: snapshot.revision, questions: snapshot.discovery.questions };
    }, model);
  }

  async checks(actor, id, model = "as-is") {
    return this.withProject(actor, id, (project) => project.validate(), model);
  }
}
