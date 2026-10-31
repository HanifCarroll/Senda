import { createAsyncLogic, createCallbackLogic, setup, types } from "xstate";

export type AgentRoute = { chat?: string; project?: string };
export type AgentMessage = { role: "user" | "assistant"; text: string; incomplete?: boolean };
export type AgentTrial = { projectId: string | null; chatId: string | null; limitUsd: number; usedUsd: number; pendingUsd: number; remainingUsd: number };
type Config = { available: boolean; message?: string; trial?: AgentTrial };
type SavedChat = { id: string; projectId?: string; model?: string; working: boolean; messages: AgentMessage[] };
type StreamEvent = { type: string; text: string; projectId?: string; model?: string; incomplete?: boolean };
type Turn = { chat: string; text: string };
type CreatedChat = { id: string };
type Services = {
  config: (route: AgentRoute, signal: AbortSignal) => Promise<Config>;
  load: (chat: string, signal: AbortSignal) => Promise<SavedChat>;
  create: (project: string | undefined, fresh: boolean, signal: AbortSignal) => Promise<CreatedChat>;
  turn: (turn: Turn, signal: AbortSignal) => Promise<Response>;
  navigate: (route: AgentRoute, replace: boolean) => void;
  reset: () => void;
  saved: (chat: SavedChat) => void;
  user: (text: string) => void;
  stream: (event: StreamEvent) => void;
  draft: (text: string) => void;
  unauthorized: (error: unknown) => boolean;
  signIn?: () => void;
};
type Context = {
  route: AgentRoute;
  chat?: string;
  project?: string;
  available: boolean | null;
  accessMessage: string;
  trial: AgentTrial | null;
  request: string;
  status: string;
  error: string;
};
type Event =
  | { type: "ROUTE_CHANGED"; route: AgentRoute }
  | { type: "SEND"; text: string }
  | { type: "NEW_CONVERSATION" }
  | { type: "STREAM_OPENED" }
  | { type: "STREAM_EVENT"; event: StreamEvent }
  | { type: "STREAM_CLOSED"; terminal: StreamEvent }
  | { type: "STREAM_FAILED"; error: unknown }
  | { type: "SET_ERROR"; error: string }
  | { type: "BUSY_STARTED" }
  | { type: "REFRESH_CONFIG" }
  | { type: "CANCEL" };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// Only newline-delimited server terminal events establish a finished turn.
// Closing the transport alone does not establish that the saved work finished.
export async function readAgentTurnStream(response: Response, onEvent: (event: StreamEvent) => void) {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Your message could not be sent.");
  }
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let buffer = "", terminal: StreamEvent | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const event = JSON.parse(buffer.slice(0, newline)) as StreamEvent;
      buffer = buffer.slice(newline + 1);
      onEvent(event);
      if (event.type === "done" || event.type === "error") terminal = event;
    }
  }
  if (!terminal) throw new Error("The connection closed before the reply finished. Check the saved conversation before sending again.");
  return terminal;
}

export function createAgentChatMachine(services: Services) {
  const usable = {
    SEND: ({ context, event }: { context: Context; event: Extract<Event, { type: "SEND" }> }) => {
      if (!event.text.trim() || context.available !== true) return;
      return { target: "sending", context: { request: event.text.trim() } };
    },
    NEW_CONVERSATION: ({ context }: { context: Context }) => {
      if (context.project && context.available !== null) return { target: "fresh" };
    },
  };
  const savedContext = (saved: SavedChat) => ({
    chat: saved.id, project: saved.projectId, error: "",
    status: saved.working ? "A reply is being prepared. Your saved progress will appear here." : "",
  });
  const createdContext = (created: CreatedChat) => ({ chat: created.id, route: { chat: created.id, project: undefined } });
  return setup({
    schemas: {
      context: types<Context>(), input: types<AgentRoute>(),
      events: {
        ROUTE_CHANGED: types<{ route: AgentRoute }>(), SEND: types<{ text: string }>(),
        NEW_CONVERSATION: types<{}>(), STREAM_OPENED: types<{}>(),
        STREAM_EVENT: types<{ event: StreamEvent }>(), STREAM_CLOSED: types<{ terminal: StreamEvent }>(),
        STREAM_FAILED: types<{ error: unknown }>(), SET_ERROR: types<{ error: string }>(),
        BUSY_STARTED: types<{}>(), REFRESH_CONFIG: types<{}>(), CANCEL: types<{}>(),
      },
    },
    actors: {
      config: createAsyncLogic({ run: ({ input, signal }: { input: AgentRoute; signal: AbortSignal }) => services.config(input, signal) }),
      load: createAsyncLogic({ run: ({ input, signal }: { input: string; signal: AbortSignal }) => services.load(input, signal) }),
      create: createAsyncLogic({ run: ({ input, signal }: { input: { project?: string; fresh: boolean }; signal: AbortSignal }) => services.create(input.project, input.fresh, signal) }),
      turn: createCallbackLogic<Event, Turn>(({ input, sendBack }) => {
        const controller = new AbortController();
        let active = true;
        void (async () => {
          try {
            const response = await services.turn(input, controller.signal);
            if (!active) return;
            sendBack({ type: "STREAM_OPENED" });
            const terminal = await readAgentTurnStream(response, event => {
              if (active) sendBack({ type: "STREAM_EVENT", event });
            });
            if (active) sendBack({ type: "STREAM_CLOSED", terminal });
          } catch (error) {
            if (active) sendBack({ type: "STREAM_FAILED", error });
          }
        })();
        return () => { active = false; controller.abort(); };
      }),
    },
  }).createMachine({
    id: "agentChat",
    context: ({ input }) => ({ route: input, chat: input.chat, project: input.project, available: null, accessMessage: "", trial: null, request: "", status: "", error: "" }),
    initial: "active",
    on: {
      CANCEL: { target: ".cancelled" },
      ROUTE_CHANGED: ({ context, event }) => {
        // The URL created by this actor does not cancel its in-flight turn.
        if (context.route.chat === event.route.chat && context.route.project === event.route.project) return {};
        return { target: ".active", reenter: true, context: { route: event.route, chat: event.route.chat, project: event.route.project, status: "", error: "", request: "" } };
      },
      SET_ERROR: ({ event }) => ({ context: { error: event.error } }),
    },
    states: {
      active: {
        type: "parallel",
        states: {
          access: {
            initial: "checking",
            on: {
              BUSY_STARTED: { target: ".paused" },
              REFRESH_CONFIG: { target: ".checking" },
            },
            states: {
              checking: {
                invoke: {
                  src: "config", input: ({ context }) => context.route,
                  onDone: ({ context, event }, enq) => {
                    const config = event.output;
                    if (!context.route.chat && !context.route.project && config.trial?.chatId) {
                      enq(services.navigate, { chat: config.trial.chatId, project: undefined }, true);
                    }
                    return { target: "settled", context: { available: config.available, accessMessage: config.message || "", trial: config.trial || null } };
                  },
                  onError: ({ event }, enq) => {
                    const unauthorized = services.unauthorized(event.error);
                    if (unauthorized) enq(() => services.signIn?.());
                    return { target: "settled", context: unauthorized ? {} : { error: message(event.error), available: false } };
                  },
                },
              },
              settled: {},
              paused: {},
            },
          },
          conversation: {
            initial: "opening",
            states: {
              opening: {
                entry: ({ context }, enq) => { if (!context.route.chat) enq(services.reset); },
                always: ({ context }) => ({ target: context.route.chat ? "loading" : context.route.project ? "projectChat" : "ready" }),
              },
              projectChat: {
                tags: ["pending"],
                invoke: {
                  src: "create", input: ({ context }) => ({ project: context.route.project, fresh: false }),
                  onDone: ({ event }, enq) => {
                    const context = createdContext(event.output);
                    enq(services.navigate, context.route, true);
                    enq.raise({ type: "REFRESH_CONFIG" });
                    return { target: "loading", context };
                  },
                  onError: ({ event }) => ({ target: "error", context: { status: "", error: message(event.error) } }),
                },
              },
              loading: {
                tags: ["pending"],
                entry: () => ({ context: { status: "Opening your conversation…" } }),
                invoke: {
                  src: "load", input: ({ context }) => context.chat!,
                  onDone: ({ event }, enq) => {
                    enq(services.saved, event.output);
                    return { target: event.output.working ? "resuming" : event.output.messages.at(-1)?.incomplete ? "incomplete" : "ready", context: savedContext(event.output) };
                  },
                  onError: ({ event }, enq) => {
                    const unauthorized = services.unauthorized(event.error);
                    if (unauthorized) enq(() => services.signIn?.());
                    return { target: "error", context: { status: "", error: unauthorized ? "" : message(event.error) } };
                  },
                },
              },
              resuming: {
                tags: ["pending"],
                entry: (_, enq) => {
                  enq.raise({ type: "REFRESH_CONFIG" });
                  return { context: { status: "A reply is being prepared. Your saved progress will appear here." } };
                },
                exit: (_, enq) => { enq.raise({ type: "REFRESH_CONFIG" }); return { context: { status: "" } }; },
                initial: "waiting",
                states: {
                  waiting: { after: { 2000: { target: "checking" } } },
                  checking: {
                    invoke: {
                      src: "load", input: ({ context }) => context.chat!,
                      onDone: ({ event }, enq) => {
                        enq(services.saved, event.output);
                        return { target: event.output.working ? "waiting" : event.output.messages.at(-1)?.incomplete ? "#agentChat.active.conversation.incomplete" : "#agentChat.active.conversation.ready", context: savedContext(event.output) };
                      },
                      onError: ({ event }, enq) => {
                        const unauthorized = services.unauthorized(event.error);
                        if (unauthorized) enq(() => services.signIn?.());
                        return { target: "#agentChat.active.conversation.error", context: { status: "", error: unauthorized ? "" : message(event.error) } };
                      },
                    },
                  },
                },
              },
              ready: { on: usable },
              incomplete: { on: usable },
              error: { on: usable },
              fresh: {
                tags: ["pending"],
                entry: (_, enq) => { enq.raise({ type: "BUSY_STARTED" }); },
                exit: (_, enq) => { enq.raise({ type: "REFRESH_CONFIG" }); },
                invoke: {
                  src: "create", input: ({ context }) => ({ project: context.project, fresh: true }),
                  onDone: ({ event }, enq) => {
                    const context = createdContext(event.output);
                    enq(services.reset); enq(services.draft, "");
                    enq(services.navigate, context.route, false);
                    return { target: "loading", context: { ...context, error: "", status: "" } };
                  },
                  onError: ({ event }) => ({ target: "error", context: { status: "", error: message(event.error) } }),
                },
              },
              sending: {
                tags: ["pending"],
                entry: (_, enq) => {
                  enq.raise({ type: "BUSY_STARTED" }); enq(services.draft, "");
                  return { context: { error: "", status: "Reading your message…" } };
                },
                exit: (_, enq) => { enq.raise({ type: "REFRESH_CONFIG" }); return { context: { status: "" } }; },
                initial: "selecting",
                states: {
                  selecting: { always: ({ context }) => ({ target: context.chat ? "turn" : "creating" }) },
                  creating: {
                    invoke: {
                      src: "create", input: ({ context }) => ({ project: context.project, fresh: false }),
                      onDone: ({ event }, enq) => {
                        const context = createdContext(event.output);
                        enq(services.navigate, context.route, true);
                        return { target: "turn", context };
                      },
                      onError: ({ context, event }, enq) => {
                        enq(services.draft, context.request);
                        return { target: "#agentChat.active.conversation.error", context: { status: "", error: message(event.error) } };
                      },
                    },
                  },
                  turn: {
                    entry: ({ context }, enq) => { enq(services.user, context.request); },
                    invoke: { src: "turn", input: ({ context }) => ({ chat: context.chat!, text: context.request }) },
                    initial: "submitting",
                    states: { submitting: { on: { STREAM_OPENED: { target: "streaming" } } }, streaming: {} },
                    on: {
                      STREAM_EVENT: ({ event }, enq) => {
                        enq(services.stream, event.event);
                        return { context: {
                          ...(event.event.type === "status" ? { status: event.event.text } : {}),
                          ...(event.event.projectId ? { project: event.event.projectId } : {}),
                          ...(event.event.type === "error" ? { error: event.event.text } : {}),
                        } };
                      },
                      STREAM_CLOSED: { target: "#agentChat.active.conversation.loading" },
                      STREAM_FAILED: ({ context, event }, enq) => {
                        enq(services.draft, context.request);
                        return { target: "#agentChat.active.conversation.recovering", context: { error: event.error instanceof Error && event.error.name === "AbortError" ? "The connection closed. Refresh to check saved progress." : message(event.error) } };
                      },
                    },
                  },
                },
              },
              recovering: {
                tags: ["pending"],
                invoke: {
                  src: "load", input: ({ context }) => context.chat!,
                  onDone: ({ event }, enq) => {
                    enq(services.saved, event.output);
                    return { target: event.output.working ? "resuming" : event.output.messages.at(-1)?.incomplete ? "incomplete" : "ready", context: savedContext(event.output) };
                  },
                  onError: ({ event }, enq) => {
                    const unauthorized = services.unauthorized(event.error);
                    if (unauthorized) enq(() => services.signIn?.());
                    return { target: "error", context: { status: "", error: unauthorized ? "" : message(event.error) } };
                  },
                },
              },
            },
          },
        },
      },
      cancelled: { type: "final" },
    },
  });
}
