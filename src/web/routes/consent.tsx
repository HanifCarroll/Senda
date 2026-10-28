import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, post, ApiError } from "@/lib/api";
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
  const [data, setData] = useState<any>(null),
    [project, setProject] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const canCreate = !!data?.scopes.includes("projects:write");
  const accessDescription = project === "new"
    ? canCreate
      ? "Your agent can create a project from a transcript you share in your chat, then read and revise its current and future models. No existing projects are added to this connection."
      : "Connect your agent now. It can ask for permission to create a project when you start. No existing projects are added to this connection."
    : `The agent can read both As-is and To-be models in the selected project, including their transcripts, evidence and diagrams${canCreate ? ", and save revisions or create a new project" : ""}.`;
  useEffect(() => {
    const query = window.location.search.slice(1);
    void api(`/api/consent?query=${encodeURIComponent(query)}`)
      .then((value) => {
        setData(value);
        if (value.scopes.includes("projects:write")) setProject("new");
        else if (value.projects.length === 1) setProject(value.projects[0].id);
        else setProject("new");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401)
          window.location.assign(`/sign-in?${query}`);
        else setError(e.message);
      });
  }, []);
  async function decide(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const access = project === "new"
        ? canCreate ? { createProjects: true } : { connectOnly: true }
        : { projectId: project };
      const value = await post("/api/consent", {
        query: window.location.search.slice(1),
        accept,
        ...(accept ? access : {}),
      });
      const target = value.redirect_uri || value.url;
      if (target) window.location.assign(target);
      else
        setError(
          "The agent did not provide a return address. Start the connection again.",
        );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
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
                <Select value={project} onValueChange={setProject}>
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
                  onClick={() => decide(true)}
                >
                  Allow connection
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => decide(false)}
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
