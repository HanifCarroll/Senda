import { Store } from "./store.js";
import { ProjectCore, initialSnapshot } from "./project-core.js";
export { schema } from "./project-core.js";

export class Project extends ProjectCore {
  constructor(directory) {
    super(new Store(directory));
  }
  static async create(directory, input, options = {}) {
    const snapshot = await initialSnapshot(input, options);
    const store = new Store(directory, { create: true });
    try {
      await store.append(
        0,
        snapshot,
        options.summary || "Initialize process discovery",
      );
    } finally {
      store.close();
    }
    return new Project(directory);
  }
}
