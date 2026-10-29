import { useEffect, useState } from "react";
import { Copy, Download, Link2, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";

export function ConnectAgent({ label = "Connect your agent" }: { label?: string }) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [browserTools, setBrowserTools] = useState<number | null>(null);
  useEffect(() => {
    if (open) {
      setError("");
      void api("/api/connections")
        .then(setData)
        .catch((e) => setError(e.message));
      const context = (document as any).modelContext;
      if (typeof context?.getTools === "function")
        void context
          .getTools()
          .then((tools: any[]) =>
            setBrowserTools(tools.some((t) => t.name === "apply_revision") ? tools.length : 0),
          )
          .catch(() => setBrowserTools(null));
      else setBrowserTools(null);
    }
  }, [open]);
  async function revoke() {
    try {
      await api("/api/connections", { method: "DELETE", body: "{}" });
      setData({ ...data, connections: [] });
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Work with your own agent</DialogTitle>
          <DialogDescription>
            Give your transcript to ChatGPT or Claude. Your connected agent creates the project
            and revises the diagram as you talk. Senda keeps the sources and history together.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">Claude is supported. ChatGPT is in beta: it can save changes but sometimes fails to display its reply. Check the saved model in Senda before repeating a request. You supply your own agent subscription. Pro also offers <a className="underline underline-offset-4" href="/app/agent">Senda’s built-in chat</a>.</p>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Connection could not be loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Alert>
          <AlertTitle>
            {browserTools
              ? "Browser tools ready"
              : browserTools === 0
                ? "Open a current project to use browser tools"
                : "Use the remote connection in this browser"}
          </AlertTitle>
          <AlertDescription>
            {browserTools
              ? `${browserTools} tools from the open project are available to a compatible browser agent. Keep this tab open while it works.`
              : browserTools === 0
                ? "This browser supports WebMCP. Project tools appear on the latest version of a private project."
                : "This browser does not expose the required WebMCP API. The remote agent connection below remains available."}
          </AlertDescription>
        </Alert>
        <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm leading-relaxed">
          <li>Add a remote MCP server in your compatible agent’s connection settings.</li>
          <li>
            <Field>
              <FieldLabel htmlFor="agent-url">Server URL</FieldLabel>
              <div className="flex gap-2">
                <Input id="agent-url" readOnly value={data?.url || ""} />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy server URL"
                  disabled={!data}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.url);
                      setCopied(true);
                    } catch {
                      setError("Select the URL and copy it from the field.");
                    }
                  }}
                >
                  <Copy />
                </Button>
              </div>
              {copied && <p role="status">URL copied.</p>}
            </Field>
          </li>
          <li>
            Sign in when your agent opens the connection page. Choose New projects to start from
            your chat, or select an existing project to continue working on it.
          </li>
          <li>
            Share the transcript in your agent chat and ask it to create a process in Senda.
            Answer its questions and request changes in the same conversation.
          </li>
        </ol>
        <Button variant="outline" asChild>
          <a href="/api/skill.zip" download="process-scribe-skill.zip">
            <Download data-icon="inline-start" />
            Download discovery method
          </a>
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your connected agent can read Senda’s discovery method. The download is also available
          for agents that use local skills.
        </p>
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">Agent access</h3>
          {data?.connections?.length ? (
            <>
              <ul className="flex flex-col gap-2 text-sm">
                {data.connections.map((c: any) => (
                  <li key={c.client + c.id} className="break-words">
                    {c.name}
                    <span className="block text-xs text-muted-foreground">{c.client}</span>
                  </li>
                ))}
              </ul>
              <Button variant="destructive" onClick={revoke}>
                <Unplug data-icon="inline-start" />
                Disconnect remote agents
              </Button>
              <p className="text-xs text-muted-foreground">
                Stops current agent access and removes refresh tokens. You can reconnect later.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No agent has access yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
