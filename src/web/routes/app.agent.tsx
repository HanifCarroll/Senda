import Markdown from "react-markdown";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Send, Paperclip, Plus } from "lucide-react";
import { AccountFrame } from "@/components/account-frame";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, post, ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/agent")({
  validateSearch: (s: Record<string, unknown>) => ({
    chat: typeof s.chat === "string" ? s.chat : undefined,
    project: typeof s.project === "string" ? s.project : undefined,
  }),
  component: AgentChat,
});
type Message = { role: "user" | "assistant"; text: string; incomplete?: boolean };
type Trial={projectId:string|null;chatId:string|null;limitUsd:number;usedUsd:number;pendingUsd:number;remainingUsd:number};
function AgentChat() {
  const search = Route.useSearch(),
    navigate = Route.useNavigate();
  const [chat, setChat] = useState(search.chat),
    [project, setProject] = useState(search.project),
    [model, setModel] = useState("as-is"),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!(search.chat || search.project)),
    [working, setWorking] = useState(false),
    [available, setAvailable] = useState<boolean | null>(null),
    [accessMessage, setAccessMessage] = useState(""),
    [trial,setTrial]=useState<Trial|null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if(busy)return;
    let active=true;
    const query=new URLSearchParams();
    if(search.chat)query.set('chat',search.chat);else if(search.project)query.set('project',search.project);
    void api<{ available: boolean; message?: string;trial?:Trial }>(`/api/agent/config?${query}`).then(c => {
      if(!active)return;
      setAvailable(c.available); setAccessMessage(c.message || "");setTrial(c.trial||null);
      if(!search.chat&&!search.project&&c.trial?.chatId)void navigate({search:{chat:c.trial.chatId,project:undefined},replace:true,resetScroll:false});
    })
      .catch(e => {
        if(!active)return;
        if (e instanceof ApiError && e.status === 401) window.location.assign("/sign-in");
        else { setError(e.message); setAvailable(false); }
      });
    return()=>{active=false};
  }, [busy,working,search.chat,search.project]);
  useEffect(() => {
    if (!search.project || search.chat) return;
    let active = true;
    void post("/api/agent/chats", { projectId: search.project })
      .then((c) => {
        if (active)
          void navigate({
            search: { chat: c.id, project: undefined },
            replace: true,
            resetScroll: false,
          });
      })
      .catch((e) => {
        if (active) { setError(e.message); setLoading(false); }
      });
    return () => {
      active = false;
    };
  }, [search.project, search.chat]);
  useEffect(() => {
    if (busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setChat(search.chat);
    setProject(search.project);
    setError("");
    setWorking(false);
    if (!search.chat) {
      setMessages([]);
      setModel("as-is");
      setStatus("");
      setLoading(!!search.project);
      return;
    }
    setLoading(true);
    setStatus("Opening your conversation…");
    async function refresh() {
      try {
        const c = await api<any>(`/api/agent/chats/${search.chat}`);
        if (!active) return;
        setChat(c.id);
        setProject(c.projectId);
        setModel(c.model || "as-is");
        setMessages(previous => {
          const next = c.messages as Message[];
          return previous.length === next.length && previous.every((m, i) =>
            m.role === next[i].role && m.text === next[i].text && !!m.incomplete === !!next[i].incomplete)
            ? previous : next;
        });
        setWorking(c.working);
        setLoading(false);
        setStatus(c.working ? "A reply is being prepared. Your saved progress will appear here." : "");
        if (c.working) timer = setTimeout(refresh, 2000);
      } catch (e: any) {
        if (!active) return;
        setLoading(false);
        setWorking(false);
        if (e instanceof ApiError && e.status === 401)
          window.location.assign("/sign-in");
        else setError(e.message);
      }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [search.chat, search.project, busy]);
  const pending = busy || loading || working || available === null;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);
  async function newConversation() {
    if (pending || !project) return;
    setBusy(true);
    try {
      const created = await post("/api/agent/chats", {
        projectId: project,
        newConversation: true,
      });
      setMessages([]);
      setText("");
      setError("");
      setStatus("");
      setChat(created.id);
      void navigate({
        search: { chat: created.id, project: undefined },
        resetScroll: false,
      });
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !text.trim()) return;
    const request = text.trim();
    setBusy(true);
    setText("");
    setError("");
    setStatus("Reading your message…");
    try {
      let id = chat;
      if (!id) {
        const c = await post(
          "/api/agent/chats",
          project ? { projectId: project } : {},
        );
        id = c.id;
        setChat(id);
        void navigate({
          search: { chat: id, project: undefined },
          replace: true,
          resetScroll: false,
        });
      }
      setMessages((p) => [...p, { role: "user", text: request }]);
      const controller = new AbortController();
      abort.current = controller;
      const response = await fetch(`/api/agent/chats/${id}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), text: request }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.message || "Your message could not be sent.");
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (event.type === "status") setStatus(event.text);
          if (event.projectId) setProject(event.projectId);
          if (event.model) setModel(event.model);
          if (event.type === "done") {
            completed = true;
            setMessages((p) => [...p, { role: "assistant", text: event.text, incomplete: event.incomplete }]);
          }
          if (event.type === "error") {
            completed = true;
            setError(event.text);
          }
        }
      }
      if (!completed) throw new Error("The connection closed before the reply finished. Check the saved conversation before sending again.");
    } catch (e: any) {
      setText(request);
      setError(
        e.name === "AbortError"
          ? "The connection closed. Refresh to check saved progress."
          : e.message,
      );
    } finally {
      setBusy(false);
      setStatus("");
      abort.current = null;
    }
  }
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
