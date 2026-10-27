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
  useEffect(() => {
    const query = window.location.search.slice(1);
    void api(`/api/consent?query=${encodeURIComponent(query)}`)
      .then((value) => {
        setData(value);
        if (value.projects.length === 1) setProject(value.projects[0].id);
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
      const value = await post("/api/consent", {
        query: window.location.search.slice(1),
        accept,
        ...(accept ? { projectId: project } : {}),
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
      <a href="/">Senda</a>
      <Card>
        <CardHeader>
          <CardTitle>Choose what your agent can work on</CardTitle>
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
                  Allow access to this project
                </FieldLabel>
                <Select value={project} onValueChange={setProject}>
                  <SelectTrigger
                    id="consent-project"
                    className="h-auto min-h-10 w-full [&>span]:whitespace-normal [&>span]:text-left"
                  >
                    <SelectValue placeholder="Select a private project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
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
                The agent can read both As-is and To-be models in the selected
                project, including their transcripts, evidence and diagrams
                {data.scopes.includes("projects:write")
                  ? ", and propose saved revisions or create a new project"
                  : ""}
                . It cannot record human approval.
              </p>
              <p className="break-words text-xs text-muted-foreground">
                Requested account access: {data.scopes.join(", ")}
                {data.claims
                  ? ". Additional profile claims were requested; review the agent request before connecting."
                  : ""}
              </p>
              {!data.projects.length && (
                <p className="text-sm">
                  <a
                    className="underline"
                    href="/app"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create a project
                  </a>
                  , then{" "}
                  <button
                    className="underline"
                    onClick={() => window.location.reload()}
                  >
                    refresh this page
                  </button>
                  .
                </p>
              )}
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
                provider receives the information it reads from this project.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
