import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMachine } from "@xstate/react";
import { createConsentMachine } from "@/lib/account-machines.js";
import { api, post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export const Route = createFileRoute("/consent")({ component: Consent });
function Consent() {
  const [machine] = useState(() => createConsentMachine({
    load: (query: string, signal: AbortSignal) => api(`/api/consent?query=${encodeURIComponent(query)}`, { signal }),
    decide: (input: any) => post("/api/consent", input),
    navigate: (url: string) => window.location.assign(url),
  }));
  const [state, send] = useMachine(machine);
  const { data, project, error } = state.context;
  const busy = state.hasTag("busy");
  const canCreate = !!data?.scopes.includes("projects:write");
  const accessDescription = project === "new"
    ? canCreate
      ? "Your agent can create a project from a transcript you share in your chat, then read and revise its current and future models. No existing projects are added to this connection."
      : "Connect your agent now. It can ask for permission to create a project when you start. No existing projects are added to this connection."
    : `The agent can read both As-is and To-be models in the selected project, including their transcripts, evidence and diagrams${canCreate ? ", and save revisions or create a new project" : ""}.`;
  useEffect(() => {
    send({ type: "START", query: window.location.search.slice(1) });
  }, [send]);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <a href="/" aria-label="Senda home" className="w-fit"><Brand className="h-10" /></a>
      <Card>
        <CardHeader>
          <CardTitle>Connect your agent</CardTitle>
          <CardDescription>
            {data?.clientInfo?.client_name ||
              data?.clientInfo?.name ||
              "Your agent"}{" "}
            is requesting a connection to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Connection needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {data && (
            <>
              <Field>
                <FieldLabel htmlFor="consent-project">
                  What can your agent work on?
                </FieldLabel>
                <Select value={project} onValueChange={(project) => send({ type: "SELECT", project })}>
                  <SelectTrigger
                    id="consent-project"
                    className="h-auto min-h-10 w-full [&>span]:whitespace-normal [&>span]:text-left"
                  >
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="new">
                        {canCreate ? "New projects" : "Connect without a project"}
                      </SelectItem>
                      {data.projects.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-sm leading-relaxed">
                {accessDescription}
              </p>
              <p className="break-words text-xs text-muted-foreground">
                Requested account access: {data.scopes.join(", ")}
                {data.claims
                  ? ". Additional profile claims were requested; review the agent request before connecting."
                  : ""}
              </p>
              <div className="flex gap-3">
                <Button
                  disabled={busy || !project}
                  onClick={() => send({ type: "ACCEPT" })}
                >
                  Allow connection
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => send({ type: "REJECT" })}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                You can disconnect agents from the app at any time. Your agent
                provider receives the information it reads from connected projects.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
