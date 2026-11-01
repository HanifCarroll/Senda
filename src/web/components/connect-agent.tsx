import { useState } from "react";
import { useMachine } from "@xstate/react";
import { createConnectionMachine } from "@/lib/account-machines.js";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

const starterPrompt = "Use Senda to map this interview as the current process. Suggest a name and scope from the transcript, link each step to its source, and ask about anything unclear. Keep revising the same model as I answer.";

export function ConnectAgent({ label = "Connect your agent" }: { label?: string }) {
  const [copied, setCopied] = useState<"url" | "prompt" | null>(null);
  const [promptCopyFailed, setPromptCopyFailed] = useState(false);
  const [machine] = useState(() => createConnectionMachine({
    load: (signal: AbortSignal) => api("/api/connections", { signal }),
    revoke: (signal: AbortSignal) => api("/api/connections", { method: "DELETE", body: "{}", signal }),
    tools: async () => {
      const context = (document as any).modelContext;
      if (typeof context?.getTools !== "function") return null;
      const tools: any[] = await context.getTools();
      return tools.some((t) => t.name === "apply_revision") ? tools.length : 0;
    },
  }));
  const [state, send] = useMachine(machine);
  const { data, error, browserTools } = state.context;
  const open = state.matches("open");
  return (
    <Dialog open={open} onOpenChange={(open) => {
      setCopied(null);
      setPromptCopyFailed(false);
      send({ type: open ? "OPEN" : "CLOSE" });
    }}>
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
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connect the assistant you already use, or try <a className="underline underline-offset-4" href="/app/agent">Senda’s built-in chat</a>.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Connection could not be loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="agent-url">Server URL</FieldLabel>
          <div className="flex gap-2">
            <Input id="agent-url" className="min-w-0" readOnly value={data?.url || ""} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy server URL"
              disabled={!data?.url}
              onClick={async () => {
                setCopied(null);
                try {
                  await navigator.clipboard.writeText(data.url);
                  setCopied("url");
                } catch {
                  send({ type: "COPY_FAILED" });
                }
              }}
            >
              <Copy />
            </Button>
          </div>
          {copied === "url" && <p role="status">URL copied.</p>}
        </Field>
        <Tabs defaultValue="claude" className="gap-4">
          <TabsList aria-label="Assistant setup" className="w-full">
            <TabsTrigger value="claude">Claude</TabsTrigger>
            <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
          </TabsList>
          <TabsContent value="claude" className="space-y-4">
            <ol className="flex list-decimal flex-col gap-3 pl-5 leading-relaxed">
              <li>In Claude, open <strong>Customize → Connectors</strong>. Choose <strong>+ Add → Add custom connector</strong>.</li>
              <li>Name it <strong>Senda</strong> and paste the server URL above. Choose <strong>Continue</strong>, review the detected OAuth settings, then <strong>Continue</strong> again.</li>
              <li>Choose <strong>Sign in now</strong> and <strong>Use Claude’s published identity</strong>, then <strong>Add</strong>. Sign in to Senda and choose <strong>New projects</strong> or an existing project to work on.</li>
              <li>In a new Claude chat, use <strong>+ → Connectors</strong> to enable Senda. Share your transcript with the starter prompt below.</li>
            </ol>
            <p className="text-xs leading-relaxed text-muted-foreground">
              In a managed workspace, an owner may need to add Senda first. <a className="underline underline-offset-4" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Claude’s setup guide</a>
            </p>
          </TabsContent>
          <TabsContent value="chatgpt" className="space-y-4">
            <p className="text-sm leading-relaxed">ChatGPT can save diagrams to Senda only on Business, Enterprise and Edu plans. On ChatGPT Pro, it can read and fetch from Senda but cannot save changes.</p>
            <ol className="flex list-decimal flex-col gap-3 pl-5 leading-relaxed">
              <li>On ChatGPT web, open <strong>Plugins</strong>. Choose <strong>+ → Add custom MCP server</strong>.</li>
              <li>Name it <strong>Senda</strong>. Under <strong>Connection</strong>, paste the server URL above and choose <strong>OAuth</strong>.</li>
              <li>Review ChatGPT’s server warning, then choose <strong>Create as a plugin</strong>. Sign in to Senda and choose <strong>New projects</strong> or an existing project to work on.</li>
              <li>Install Senda, start a new chat, type <strong>@</strong> and select Senda. Share your transcript with the starter prompt below.</li>
            </ol>
            <details className="text-sm leading-relaxed">
              <summary className="cursor-pointer font-medium">Using the older Apps screen?</summary>
              <p className="mt-2 text-muted-foreground">
                Open <strong>Settings → Apps → Create</strong>, or <strong>Workspace settings → Apps → Create</strong>. Enter Senda’s name and the server URL, choose <strong>OAuth</strong>, then <strong>Scan Tools</strong>. Sign in to Senda and choose your project access, then create the app. In a new chat, select Senda from the apps list.
              </p>
            </details>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Workspace settings may also limit custom connections. <a className="underline underline-offset-4" href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" target="_blank" rel="noreferrer">ChatGPT’s setup guide</a>
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              ChatGPT is in beta. If its reply is missing, open the saved project in Senda before repeating the request.
            </p>
          </TabsContent>
        </Tabs>
        <Field>
          <FieldLabel htmlFor="agent-prompt">Starter prompt</FieldLabel>
          <p className="text-sm text-muted-foreground">Paste this with your transcript after you connect.</p>
          <Textarea id="agent-prompt" className="resize-y leading-relaxed" readOnly value={starterPrompt} />
          <Button variant="outline" onClick={async () => {
            setCopied(null);
            setPromptCopyFailed(false);
            try {
              await navigator.clipboard.writeText(starterPrompt);
              setCopied("prompt");
            } catch {
              setPromptCopyFailed(true);
            }
          }}>
            <Copy data-icon="inline-start" />
            Copy starter prompt
          </Button>
          {copied === "prompt" && <p role="status">Starter prompt copied.</p>}
          {promptCopyFailed && <p role="status">Select the starter prompt and copy it from the field.</p>}
        </Field>
        <Button variant="outline" asChild>
          <a href="/api/skill.zip" download="senda-skill.zip">
            <Download data-icon="inline-start" />
            Download discovery method
          </a>
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your connected agent can read Senda’s discovery method. The download is also available
          for agents that use local skills.
        </p>
        {typeof browserTools === "number" && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Advanced: browser tools</summary>
            <Alert className="mt-3">
              <AlertTitle>
                {browserTools > 0 ? "Browser tools ready" : "Open a current project to use browser tools"}
              </AlertTitle>
              <AlertDescription>
                {browserTools > 0
                  ? `${browserTools} ${browserTools === 1 ? "tool" : "tools"} from the open project ${browserTools === 1 ? "is" : "are"} available to a compatible browser agent. Keep this tab open while it works.`
                  : "This browser supports WebMCP. Project tools appear on the latest version of a private project."}
              </AlertDescription>
            </Alert>
          </details>
        )}
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
              <Button variant="destructive" disabled={!state.can({ type: "REVOKE" })} onClick={() => send({ type: "REVOKE" })}>
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
