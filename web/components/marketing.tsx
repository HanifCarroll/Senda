import { ArrowRight, GitBranch, FileText, MessageSquare, History, Download } from "lucide-react";
import { productName } from "@/lib/brand";
import { Button } from "./ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";

export function Marketing() {
  return (
    <div className="bg-background">
      <header className="border-b bg-background">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-5 sm:px-8"
        >
          <a href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
            <GitBranch className="size-5" />
            {productName}
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
            Bring the conversation. Keep the context. Take the diagram with you.
          </p>
          <figure className="mt-6 w-full">
            <a href="/example?view=FinanceWork&element=Invoice">
              <picture>
                <source
                  media="(max-width: 640px)"
                  srcSet="/marketing/evidence-mobile.webp 390w, /marketing/evidence-mobile-2x.webp 780w"
                  sizes="calc(100vw - 40px)"
                  width="390"
                  height="718"
                />
                <img
                  src="/marketing/evidence.webp"
                  srcSet="/marketing/evidence.webp 1200w, /marketing/evidence-2x.webp 2400w"
                  sizes="(max-width: 1200px) calc(100vw - 64px), 1088px"
                  width="1200"
                  height="800"
                  fetchPriority="high"
                  alt="A deposit invoice step alongside the exact transcript passage supporting it in the running review app."
                  className="w-full rounded-xl border bg-card shadow-xl shadow-foreground/5"
                />
              </picture>
            </a>
            <figcaption className="mt-4 text-sm text-muted-foreground">
              Zoom into a step and read the passage behind it. All screenshots use a fictional
              onboarding interview.
            </figcaption>
          </figure>
        </section>
        <section id="how-it-works" className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div className="flex flex-col gap-6">
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                Find the missing decision before it becomes an assumption.
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                An interview can describe two teams’ work without saying whether one must wait for
                the other. A polished diagram can hide that gap. Keep it visible, ask the question,
                then revise from the answer.
              </p>
              <blockquote className="border-l-2 pl-5 text-lg leading-relaxed">
                “I would want them to confirm whether one is supposed to wait for the other.”
                <footer className="mt-3 text-sm text-muted-foreground">
                  From the synthetic onboarding interview
                </footer>
              </blockquote>
            </div>
            <figure>
              <a href="/example?draft=true&section=questions">
                <img
                  src="/marketing/clarification.webp"
                  srcSet="/marketing/clarification.webp 384w, /marketing/clarification-2x.webp 768w"
                  sizes="(max-width: 768px) calc(100vw - 40px), 548px"
                  width="384"
                  height="360"
                  loading="lazy"
                  alt="The review asks whether Finance and Delivery start together and what must finish before setup starts."
                  className="w-full rounded-xl border"
                />
              </a>
              <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The first draft makes the uncertainty available for a focused clarification.
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
                src="/marketing/overview.webp"
                srcSet="/marketing/overview.webp 1200w, /marketing/overview-2x.webp 2400w"
                sizes="(max-width: 1200px) calc(100vw - 64px), 1088px"
                width="1200"
                height="800"
                loading="lazy"
                alt="The revised onboarding overview separates parallel readiness work, setup, handover and cancellation paths."
                className="w-full rounded-xl border bg-card"
              />
            </a>
            <figcaption className="mt-3 text-sm text-muted-foreground">
              The worked example follows three scripted clarification rounds. Open a subprocess for
              the detail behind the overview.
            </figcaption>
          </figure>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                Icon: FileText,
                title: "Check why each step is there",
                text: "Open its source passages and distinguish what was reported from what still needs an answer.",
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
                "Yes. Keep the current process in As-is and start a separate To-be plan from a saved revision. Describe the intended changes, clarify decisions with your agent, and revise the plan while keeping both models’ histories. Planning does not overwrite the current process.",
              ],
              [
                "Does it include an AI agent?",
                "You bring your own compatible agent. It interprets the transcript, asks questions and proposes revisions. The app stores and checks the model; it makes no model calls itself. Your agent provider’s own usage terms apply.",
              ],
              [
                "Which agents can connect?",
                "Use an agent that supports authenticated MCP over Streamable HTTP. The server supports the 2026-07-28 protocol and stateless 2025 compatibility. The official TypeScript SDK is tested; named commercial clients will be listed after connection tests. Browser tools are an additional enhancement only where the draft WebMCP API is available.",
              ],
              [
                "Who can read my transcript?",
                "Projects belong to your account. An agent receives access only to projects you authorize; disconnecting agents removes that access. Your connected agent provider can receive the sources it reads. Storage and backups run on the configured hosting service.",
              ],
              [
                "Will the diagram be correct?",
                "Checks catch structural problems and flag gaps, but people who know the process still need to review its meaning. Reported evidence, unresolved questions and human review stay distinct. The worked examples are synthetic, not independent accuracy measurements.",
              ],
              [
                "Can I keep using the local tools?",
                "Yes. The local CLI and offline review bundles remain available. A hosted project and a local project are separate unless you explicitly transfer a model or source; private local files are not published by the hosted app.",
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
        <a
          className="underline underline-offset-4"
          href="https://github.com/HanifCarroll/process-scribe"
        >
          Source code
        </a>
      </footer>
    </div>
  );
}
