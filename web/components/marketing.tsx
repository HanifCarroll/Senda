import { ArrowRight, FileText, History, Download } from "lucide-react";
import { productName } from "@/lib/brand";
import { Button } from "./ui/button";
import { Brand } from "./brand";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";

const preview = (name: string) => `/marketing/${name}.svg?v=vector-3`;

export function Marketing() {
  return (
    <div className="bg-background">
      <header className="border-b bg-background">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-5 sm:px-8"
        >
          <a href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
            <Brand />
          </a>
          <a
            href="#how-it-works"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            How it works
          </a>
          <a
            href="#questions"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            Questions
          </a>
          <Button variant="ghost" asChild>
            <a href="/sign-in">Sign in</a>
          </Button>
          <Button asChild>
            <a href="/app">Start a process</a>
          </Button>
        </nav>
      </header>
      <main>
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-7 px-5 pt-16 pb-20 text-center sm:px-8 sm:pt-24">
          <h1 className="max-w-5xl text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
            Turn process interviews into diagrams people can agree on.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Work with your own agent to map the process, clarify missing details, and keep every
            revision connected to what people said.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <a href="/app">
                Start a process
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="/example">Explore the example</a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Keep the conversation, model and every revision in one place.
          </p>
          <figure className="mt-6 w-full">
            <a href="/example?view=FinanceWork&element=Invoice">
              <picture>
                <source
                  media="(max-width: 640px)"
                  srcSet={preview("evidence-mobile")}
                  width="390"
                  height="718"
                />
                <img
                  src={preview("evidence")}
                  width="1200"
                  height="800"
                  fetchPriority="high"
                  alt="A deposit invoice step alongside the exact transcript passage supporting it in the running review app."
                  className="w-full"
                />
              </picture>
            </a>
            <figcaption className="mt-4 text-sm text-muted-foreground">
              Open a step to read the transcript behind it.
            </figcaption>
          </figure>
        </section>
        <section id="how-it-works" className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div className="flex flex-col gap-6">
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                Clarify the decisions that shape the process.
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                When Finance and Delivery work in parallel, setup can depend on both finishing.
                Ask about the handoff, save the answer and update the diagram.
              </p>
              <blockquote className="border-l-2 pl-5 text-lg leading-relaxed">
                “I would want them to confirm whether one is supposed to wait for the other.”
                <footer className="mt-3 text-sm text-muted-foreground">
                  Onboarding interview
                </footer>
              </blockquote>
            </div>
            <figure>
              <a href="/example?draft=true&section=questions">
                <img
                  src={preview("clarification")}
                  width="544"
                  height="309"
                  loading="lazy"
                  alt="The review asks whether Finance and Delivery start together and what must finish before setup starts."
                  className="w-full"
                />
              </a>
              <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Turn an open question into the next revision.
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-20 sm:px-8">
          <div className="grid gap-8 md:grid-cols-2">
            <h2 className="max-w-md text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Change the understanding.
              <br />
              Keep the history.
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Save the answer in the project. Your agent updates the same model from the new
              evidence. Revisit an earlier revision, inspect what changed, and continue the
              conversation without starting the diagram over.
            </p>
          </div>
          <figure>
            <a href="/example">
              <img
                src={preview("overview")}
                width="1200"
                height="800"
                loading="lazy"
                alt="The revised onboarding overview separates parallel readiness work, setup, handover and cancellation paths."
                className="w-full"
              />
            </a>
            <figcaption className="mt-3 text-sm text-muted-foreground">
              Explore the revised process, then open a subprocess for the details.
            </figcaption>
          </figure>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                Icon: FileText,
                title: "Check why each step is there",
                text: "Open a step to see its source passages and related questions.",
              },
              {
                Icon: History,
                title: "Revise the same process",
                text: "Keep transcripts, clarification answers and saved diagrams together as the process becomes clearer.",
              },
              {
                Icon: Download,
                title: "Take the result into other tools",
                text: "Download standard BPMN with the improved layout, ready to inspect in another compatible editor.",
              },
            ].map(({ Icon, title, text }) => (
              <div key={title} className="flex flex-col gap-3">
                <Icon className="size-6" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="border-y bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-16 sm:px-8">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Your agent. One shared project.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                You do the interviewing and review with the agent you already use. The app keeps the
                diagram and supporting material ready to explore.
              </p>
            </div>
            <ol className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  title: "Add the conversation",
                  text: "Create a private project and paste or upload a text transcript. State the process you want to understand.",
                },
                {
                  title: "Connect your agent",
                  text: "Choose a project it may access and give it the discovery method. Ask it to draft from the sources and identify gaps.",
                },
                {
                  title: "Clarify and keep revising",
                  text: "Save answers, ask for changes and watch saved revisions appear. Review the model, then export when you are ready.",
                },
              ].map((step, i) => (
                <li key={step.title} className="flex flex-col gap-3">
                  <span className="text-sm font-medium text-muted-foreground">0{i + 1}</span>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section
          id="questions"
          className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 md:grid-cols-[0.7fr_1.3fr]"
        >
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Before you start</h2>
          <Accordion type="single" collapsible>
            {[
              [
                "What kind of diagram do I get?",
                "A BPMN process model: a standard way to show activities, decisions, responsibilities and handoffs. You can explore the process in the app and download a .bpmn file for another compatible editor.",
              ],
              [
                "Can I plan a future process too?",
                "Yes. Keep the current process in As-is and start a separate To-be plan from a saved revision. Describe the intended changes and revise the plan with your agent. Each model keeps its own history.",
              ],
              [
                "How does Senda work with my agent?",
                "Your agent reads the transcript, asks clarification questions and updates the process. Senda keeps the diagram, evidence and revision history together so you can review the work as it develops.",
              ],
              [
                "Which agents can connect?",
                "Use an agent that supports remote MCP connections. Connect it from your workspace and choose the projects it can access.",
              ],
              [
                "Who can read my transcript?",
                "Your projects are private to your account. You choose which projects each agent can access and can revoke that access at any time. A connected agent can read the sources in the projects you share with it.",
              ],
              [
                "How do I review the model?",
                "Use Review checks to find structural issues and unanswered questions. Walk through the diagram with the people who do the work, inspect the source passages and save their feedback for the next revision.",
              ],
              [
                "Can I keep using the local tools?",
                "Yes. Use the CLI to create and revise local projects, then export diagrams and offline review bundles.",
              ],
            ].map(([question, answer], i) => (
              <AccordionItem key={question} value={String(i)}>
                <AccordionTrigger>{question}</AccordionTrigger>
                <AccordionContent className="leading-relaxed text-muted-foreground">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
        <section className="border-t bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:px-8">
            <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Make the next process conversation easier to follow.
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="lg" asChild>
                <a href="/app">
                  Start a process
                  <ArrowRight data-icon="inline-end" />
                </a>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <a href="/example">Explore the example</a>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-sm text-muted-foreground sm:px-8">
        <span>
          {productName} · Built by{" "}
          <a className="underline underline-offset-4" href="https://hanifcarroll.com">
            Hanif Carroll
          </a>
        </span>
        <div className="flex gap-5">
          <a className="underline underline-offset-4" href="/privacy">Privacy</a>
          <a
            className="underline underline-offset-4"
            href="https://github.com/HanifCarroll/process-scribe"
          >
            Source code
          </a>
        </div>
      </footer>
    </div>
  );
}
