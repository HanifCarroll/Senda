import Markdown from "react-markdown";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { ArrowLeft, ArrowUpRight, Send, Paperclip, Plus } from "lucide-react";
import { AccountFrame } from "@/components/account-frame";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, ApiError } from "@/lib/api";
import { createAgentChatMachine, type AgentMessage } from "@/lib/agent-chat-machine";

export const Route = createFileRoute("/app/agent")({
  validateSearch: (s: Record<string, unknown>) => ({
    chat: typeof s.chat === "string" ? s.chat : undefined,
    project: typeof s.project === "string" ? s.project : undefined,
  }),
  component: AgentChat,
});
function AgentChat() {
  const search = Route.useSearch(), navigate = Route.useNavigate();
  const [model, setModel] = useState("as-is"),
    [messages, setMessages] = useState<AgentMessage[]>([]),
    [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const [machine] = useState(() => createAgentChatMachine({
    config: (route, signal) => {
      const query = new URLSearchParams();
      if (route.chat) query.set("chat", route.chat);
      else if (route.project) query.set("project", route.project);
      return api(`/api/agent/config?${query}`, { signal });
    },
    load: (chat, signal) => api(`/api/agent/chats/${chat}`, { signal }),
    create: (project, fresh, signal) => api("/api/agent/chats", {
      method: "POST", signal,
      body: JSON.stringify(fresh ? { projectId: project, newConversation: true } : project ? { projectId: project } : {}),
    }),
    turn: (turn, signal) => fetch(`/api/agent/chats/${turn.chat}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), text: turn.text }),
      signal,
    }),
    navigate: (route, replace) => { void navigate({ search: { chat: route.chat, project: route.project }, replace, resetScroll: false }); },
    reset: () => { setMessages([]); setModel("as-is"); },
    saved: saved => {
      setModel(saved.model || "as-is");
      setMessages(previous => {
        const next = saved.messages;
        return previous.length === next.length && previous.every((message, index) =>
          message.role === next[index].role && message.text === next[index].text && !!message.incomplete === !!next[index].incomplete)
          ? previous : next;
      });
    },
    user: request => setMessages(previous => [...previous, { role: "user", text: request }]),
    stream: event => {
      if (event.model) setModel(event.model);
      if (event.type === "done") setMessages(previous => [...previous, { role: "assistant", text: event.text, incomplete: event.incomplete }]);
    },
    draft: setText,
    unauthorized: error => error instanceof ApiError && error.status === 401,
    signIn: () => window.location.assign("/sign-in"),
  }));
  const [snapshot, dispatch] = useMachine(machine, { input: { chat: search.chat, project: search.project } });
  const { chat, project, available, accessMessage, trial, status, error } = snapshot.context;
  const pending = snapshot.hasTag("pending") || available === null;
  useEffect(() => {
    dispatch({ type: "ROUTE_CHANGED", route: { chat: search.chat, project: search.project } });
  }, [dispatch, search.chat, search.project]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  function newConversation() { dispatch({ type: "NEW_CONVERSATION" }); }
  function send(event: React.FormEvent) {
    event.preventDefault();
    dispatch({ type: "SEND", text });
  }
  function setError(error: string) { dispatch({ type: "SET_ERROR", error }); }
  return (
    <AccountFrame>
      <main className="mx-auto flex min-h-[calc(100dvh-90px)] max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Button variant="ghost" asChild>
            <a href="/app">
              <ArrowLeft />
              Your processes
            </a>
          </Button>
          {project && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              onClick={newConversation}
              disabled={pending}
            >
              <Plus />
            </Button>
          )}
          {project && (
            <Button variant="outline" asChild>
              <a href={`/app/projects/${project}?model=${model}`}>
                Open diagram
                <ArrowUpRight />
              </a>
            </Button>
          )}
        </header>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Map your process
          </h1>
          <p className="mt-2 text-muted-foreground">
            Share an interview, clarify the details and plan what comes next.
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Your messages and relevant process records are sent to OpenAI.{' '}
            <a href="/privacy" className="underline underline-offset-4">How your data is used</a>
          </p>
        </div>
        {trial&&<section aria-label="Free Luna trial" className="space-y-2 rounded-xl border bg-muted/40 p-4 text-sm leading-6">
          <p className="font-medium">Try Luna on one project — no payment card needed</p>
          <p>Your ${trial.limitUsd.toFixed(2)} lifetime allowance covers the draft, clarification and separate To-be revisions in this project. ${trial.remainingUsd.toFixed(2)} remains after used or reserved allowance. Saved work and downloads stay available when the trial ends.</p>
          <p><a className="underline underline-offset-4" href="/usage">How the trial works</a>{' · '}<a className="underline underline-offset-4" href="/app/billing">Continue with Pro</a></p>
        </section>}
        <div className="flex flex-1 flex-col gap-8" aria-live="polite">
          {messages.map((m, i) => (
            <article
              key={i}
              className={
                m.role === "user" ? "ml-8 rounded-xl bg-muted p-5" : "mr-4 py-2"
              }
            >
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {m.role === "user" ? "You" : "Senda"}
              </p>
              {m.incomplete && <p className="mb-3 text-sm font-medium">Some requested changes are unfinished. Your saved progress is safe.</p>}
              <div className="break-words text-sm leading-7 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_h2]:mt-5 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold">
                {m.role === "assistant" ? (
                  <Markdown
                    allowedElements={["p", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre", "a", "br", "h1", "h2", "h3", "hr"]}
                    unwrapDisallowed
                    urlTransform={(url) => {
                      try {
                        const origin = typeof window === "undefined" ? "https://senda.hanifcarroll.com" : window.location.origin;
                        const target = new URL(url, origin);
                        return target.origin === origin ? target.pathname + target.search + target.hash : "";
                      } catch { return ""; }
                    }}
                  >{m.text}</Markdown>
                ) : (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                )}
              </div>
            </article>
          ))}
          {pending && (
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          )}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Conversation paused</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {available === false ? (
          <Alert>
            <AlertTitle>{accessMessage ? "Built-in chat needs attention" : "The built-in agent isn’t available for your account yet"}</AlertTitle>
            <AlertDescription>{accessMessage || "You can use Senda with ChatGPT or Claude. Choose Connect your agent above to get started."}</AlertDescription>
            {trial?.chatId&&trial.chatId!==chat&&<Button variant="outline" className="mt-3 mr-3" asChild><a href={`/app/agent?chat=${trial.chatId}`}>Open your trial project</a></Button>}
            {accessMessage && <Button variant="outline" className="mt-3" asChild><a href="/app/billing">Your plan</a></Button>}
          </Alert>
        ) : <form
          onSubmit={send}
          className="sticky bottom-0 flex flex-col gap-3 bg-background py-4"
        >
          <label htmlFor="agent-message" className="text-sm font-medium">
            {messages.length
              ? "Continue the conversation"
              : "Your transcript or process notes"}
          </label>
          <Textarea
            id="agent-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={60000}
            placeholder="Here are my interview notes. Help me map the process and ask about anything unclear."
            required
            disabled={pending}
          />
          <div className="flex items-center justify-between gap-4">
            <Button variant="ghost" asChild disabled={pending}>
              <label htmlFor="agent-transcript" className="cursor-pointer">
                <Paperclip />
                Attach transcript
              </label>
            </Button>
            <input
              id="agent-transcript"
              className="sr-only"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              disabled={pending}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 240000) {
                  setError("Choose a transcript under 60,000 characters.");
                  return;
                }
                const content = await file.text();
                if (content.length > 60000) {
                  setError("Choose a transcript under 60,000 characters.");
                  return;
                }
                setText(content);
                setError("");
                event.target.value = "";
              }}
            />

            <Button type="submit" disabled={pending || !text.trim()}>
              <Send />
              {pending ? "Working…" : "Send message"}
            </Button>
          </div>
        </form>}
        <div ref={end} />
      </main>
    </AccountFrame>
  );
}
