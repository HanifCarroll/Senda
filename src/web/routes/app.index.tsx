import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, ArrowUpRight } from "lucide-react";
import { api, post, ApiError } from "@/lib/api";
import { AccountFrame } from "@/components/account-frame";
import { ConnectAgent } from "@/components/connect-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/app/")({ component: Projects });
function Projects() {
  const [projects, setProjects] = useState<any[] | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<any[]>("/api/projects")
      .then(setProjects)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign("/sign-in");
        else setError(e.message);
      });
  }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      const project = await post("/api/projects", {
        name: f.get("name"),
        purpose: f.get("purpose"),
        perspective: f.get("perspective"),
        ...(text.trim()
          ? {
              source: {
                id: `Transcript_${crypto.randomUUID()}`,
                title: "Initial process interview",
                kind: "transcript",
                text,
              },
            }
          : {}),
      });
      window.location.assign(`/app/projects/${project.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <AccountFrame>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your processes</h1>
            <p className="mt-2 text-muted-foreground">
              Give your transcript to your agent. Review the diagrams and revisions here.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus data-icon="inline-start" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Start a process project</DialogTitle>
                <DialogDescription>
                  Describe the process you want to understand. You can add more sources as the
                  conversation continues.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="flex flex-col gap-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="project-name">Process name</FieldLabel>
                    <Input
                      id="project-name"
                      name="name"
                      required
                      maxLength={160}
                      placeholder="Client onboarding"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="project-purpose">
                      What do you want to understand?
                    </FieldLabel>
                    <Input
                      id="project-purpose"
                      name="purpose"
                      required
                      maxLength={2000}
                      placeholder="How a signed order becomes a ready-to-start project"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="perspective">Whose process is this?</FieldLabel>
                    <Input
                      id="perspective"
                      name="perspective"
                      required
                      maxLength={2000}
                      placeholder="The onboarding team"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="initial-file">Upload a transcript (optional)</FieldLabel>
                    <Input
                      id="initial-file"
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file && file.size <= 300000) setText(await file.text());
                        else if (file) setError("Choose a text transcript smaller than 300 KB.");
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="transcript">Transcript text</FieldLabel>
                    <Textarea
                      id="transcript"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={6}
                      maxLength={300000}
                      placeholder="Paste the interview here, or upload a text file above."
                    />
                  </Field>
                </FieldGroup>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Project could not be created</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving project…" : "Create private project"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {error && !open && (
          <Alert variant="destructive">
            <AlertTitle>Projects could not be loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {projects === null ? (
          <Skeleton className="h-40 w-full" />
        ) : projects.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardHeader>
                  <CardTitle>
                    <a
                      className="flex items-center justify-between gap-3 hover:underline"
                      href={`/app/projects/${project.id}`}
                    >
                      {project.name}
                      <ArrowUpRight className="size-5 shrink-0" />
                    </a>
                  </CardTitle>
                  <CardDescription>
                    Created {new Date(project.created).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Private to your account and the agent connections you authorize.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Start with your agent</CardTitle>
              <CardDescription>
                Connect Senda to ChatGPT or Claude, then share your transcript in that chat.
                Your agent creates the project and asks about anything unclear.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <ConnectAgent label="Set up your agent" />
              <Button variant="link" asChild>
                <a href="/example">Explore a worked example</a>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </AccountFrame>
  );
}
