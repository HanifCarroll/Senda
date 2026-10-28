import { useEffect, useRef } from "react";
import { api, post } from "@/lib/api";
const failure = (error: any) => ({
  error: {
    code: error.code || "REQUEST_FAILED",
    message: error.message || "Refresh the project and try again.",
  },
});

/** Progressive enhancement only: no shim is installed in unsupported browsers. */
export function BrowserAgent({
  projectId,
  model,
  onChange,
  historical = false,
  visible,
}: {
  projectId: string;
  model: "as-is" | "to-be";
  onChange: () => void;
  historical?: boolean;
  visible?: Record<string, unknown>;
}) {
  const current = useRef(visible);
  current.current = visible;
  useEffect(() => {
    const context = (document as any).modelContext;
    if (historical || typeof context?.registerTool !== "function") return;
    const controller = new AbortController();
    void (async () => {
      const endpoint = `/api/browser-tools?project=${encodeURIComponent(projectId)}&model=${model}`;
      const tools = await api<any[]>(endpoint, { signal: controller.signal });
      await context.registerTool(
        {
          name: "get_visible_project_context",
          description:
            "Read the project, revision and selection currently visible to the user before proposing a change.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          execute: async () => {
            try {
              const models = await api(`/api/projects/${projectId}/models`);
              return {
                projectId,
                model,
                serverRevision:
                  (model === "as-is" ? models.asIs : models.toBe)?.revision ??
                  null,
                baseline: models.toBe?.baseline,
                visible: current.current,
              };
            } catch (error) {
              return failure(error);
            }
          },
        },
        { signal: controller.signal },
      );
      for (const tool of tools) {
        if (controller.signal.aborted) break;
        await context.registerTool(
          {
            ...tool,
            execute: async (arguments_: Record<string, unknown>) => {
              try {
                const result = await post(endpoint, {
                  name: tool.name,
                  arguments: arguments_,
                });
                if (!controller.signal.aborted) onChange();
                return result;
              } catch (error) {
                return failure(error);
              }
            },
          },
          { signal: controller.signal },
        );
      }
    })().catch((error) => {
      if (error.name !== "AbortError")
        console.warn(
          "Browser agent tools could not be registered. The remote connection remains available.",
        );
    });
    return () => controller.abort();
  }, [projectId, model, onChange, historical]);
  return null;
}
