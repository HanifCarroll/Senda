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
  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await projects.purgeDeleted();
    } catch (error) {
      console.error("Deleted project cleanup failed:", error.name);
    } finally {
      cleaning = false;
    }
  };
  await cleanup();
  const cleanupTimer = setInterval(() => { void cleanup(); }, 60 * 60 * 1000);
  cleanupTimer.unref();
  return {
    ...app,
    close() {
      clearInterval(cleanupTimer);
      projects.close();
      service.close();
    },
  };
}
