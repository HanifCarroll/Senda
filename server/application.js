import { openHostedProjects } from "./projects.js";
import { createAuth } from "./auth.js";
import { createRequestHandler } from "./handler.js";
export async function createApplication({ origin, directory, secret }) {
  const projects = await openHostedProjects(directory);
  const service = await createAuth({ origin, directory, projects, secret });
  await service.auth.$context;
  const app = await createRequestHandler({
    origin,
    projects,
    auth: service.auth,
  });
  return {
    ...app,
    close() {
      projects.close();
      service.close();
    },
  };
}
