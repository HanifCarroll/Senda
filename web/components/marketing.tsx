import { ArrowRight, FileText, History, Download, GitBranch } from "lucide-react";
import { productName } from "@/lib/brand";
import { Button } from "./ui/button";
import { Brand } from "./brand";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";

const preview = (name: string) => `/marketing/${name}.svg?v=vector-3`;

const navLink = "hidden text-sm text-muted-foreground hover:text-foreground md:block";
const eyebrow = "text-sm font-medium text-[var(--brand-teal)]";

export function Marketing() {
  return (
    <div className="bg-background">
      <header className="border-b bg-background">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-5 py-5 sm:gap-4 sm:px-8"
        >
          <a href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
            <Brand className="h-8 sm:h-9" />
          </a>
          <a href="#how-it-works" className={navLink}>
            How it works
          </a>
          <a href="#your-agent" className={navLink}>
            Your agent
          </a>
          <a href="#questions" className={navLink}>
            Questions
          </a>
          <Button variant="ghost" className="px-2 sm:px-3" asChild>
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
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl">
            Bring a transcript and the AI agent you already work with. Together you map the process
            in BPMN, settle the open questions, and trace every step back to what people said.
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
          <figure className="mt-8 w-full max-w-sm sm:max-w-none">
            <a href="/example?view=FinanceWork&element=Invoice" className="block">
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
                  alt="A deposit invoice step selected in a client onboarding diagram, with the transcript passage that supports it."
                  className="w-full"
                />
              </picture>
            </a>
            <figcaption className="mt-4 text-sm text-muted-foreground">
              Select any step to read the interview passage behind it.
            </figcaption>
          </figure>
        </section>

        <section id="how-it-works" className="border-y bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <p className={eyebrow}>How it works</p>
              <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                From one conversation to the process you want next.
              </h2>
            </div>
            <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {[
                {
                  title: "Add the interview",
                  text: "Create a private project, paste or upload the transcript, and name the process you want to understand.",
                },
                {
                  title: "Map how it works today",
                  text: "Your agent drafts the As-is model from the transcript and flags what the interview left unclear.",
                },
                {
                  title: "Settle the open questions",
                  text: "Take the questions back to the people who do the work. Save their answers and revise the same model.",
                },
                {
                  title: "Plan how it should work",
                  text: "Start a To-be model from a saved As-is revision, describe the changes, and revise it on its own track.",
                },
              ].map((step, i) => (
                <li key={step.title} className="flex flex-col gap-3 border-t pt-5">
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">
                    0{i + 1}
                  </span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div className="flex flex-col gap-6">
            <p className={eyebrow}>Clarify</p>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              Find the decisions the interview skipped.
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              An interview can describe two teams’ work without saying whether one waits for the other.
              Gaps like that become specific questions in the project, so the answer goes into the
              next revision instead of a guess.
            </p>
            <blockquote className="border-l-2 border-[var(--brand-teal)] pl-5 text-lg leading-relaxed">
              “I would want them to confirm whether one is supposed to wait for the other.”
              <footer className="mt-3 text-sm text-muted-foreground">Onboarding interview</footer>
            </blockquote>
          </div>
          <figure>
            <a href="/example?draft=true&section=questions" className="block">
              <img
                src={preview("clarification")}
                width="544"
                height="309"
                loading="lazy"
                alt="An open question asking whether Finance and Delivery start together and what must finish before setup starts."
                className="w-full"
              />
            </a>
            <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Copy the question, or prepare the answer once you have it.
            </figcaption>
          </figure>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-20 sm:px-8">
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <div>
                <p className={eyebrow}>Revise</p>
                <h2 className="mt-3 max-w-md text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                  One model that improves with every answer.
                </h2>
              </div>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground md:pt-9">
                Save an answer, then ask your agent to revise the same diagram. Revisit an earlier
                revision, see what changed, and keep going without redrawing anything.
              </p>
            </div>
            <figure>
              <a href="/example" className="block">
                <img
                  src={preview("overview")}
                  width="1200"
                  height="800"
                  loading="lazy"
                  alt="A revised client onboarding overview with parallel readiness work, setup, handover and cancellation paths."
                  className="w-full"
                />
              </a>
              <figcaption className="mt-3 text-sm text-muted-foreground">
                The revised onboarding process. Open a subprocess to see its detail.
              </figcaption>
            </figure>
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {[
                {
                  Icon: FileText,
                  title: "Read the sources behind a step",
                  text: "Each step links to the transcript passages and questions behind it.",
                },
                {
                  Icon: History,
                  title: "Full revision history",
                  text: "Transcripts, answers and saved diagrams stay together in the project.",
                },
                {
                  Icon: GitBranch,
                  title: "Separate As-is and To-be models",
                  text: "The current process and the future plan keep separate histories.",
                },
                {
                  Icon: Download,
                  title: "Export standard BPMN",
                  text: "Download a .bpmn file and open it in any compatible editor.",
                },
              ].map(({ Icon, title, text }) => (
                <div key={title} className="flex flex-col gap-3">
                  <Icon className="size-6 text-[var(--brand-teal)]" aria-hidden="true" />
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="your-agent" className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-2 md:gap-16">
            <div className="flex flex-col gap-6">
              <p className={eyebrow}>Your agent</p>
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                Keep working with the agent you already trust.
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Connect the agent you already use to a project that keeps the diagram, sources and
                history together. Continue the work in the conversation you are already having.
              </p>
            </div>
            <dl className="flex flex-col gap-8 md:pt-9">
              {[
                {
                  term: "Your agent does the thinking",
                  detail:
                    "It reads the transcript, drafts the model, raises questions and revises from your answers.",
                },
                {
                  term: "Senda keeps the record",
                  detail:
                    "Every revision, answer and source passage is saved for you to review.",
                },
                {
                  term: "You decide what it can open",
                  detail:
                    "Connect an agent that supports remote MCP and OAuth. Authorize it from your account, choose its projects, and revoke access whenever you like.",
                },
              ].map(({ term, detail }) => (
                <div key={term} className="flex flex-col gap-2 border-l-2 pl-5">
                  <dt className="font-semibold">{term}</dt>
                  <dd className="leading-relaxed text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="questions"
          className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 md:grid-cols-[0.7fr_1.3fr]"
        >
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
          <Accordion type="single" collapsible>
            {[
              [
                "What kind of diagram do I get?",
                "A BPMN process model, the standard notation for activities, decisions, responsibilities and handoffs. Explore it in Senda or download a .bpmn file for any compatible editor.",
              ],
              [
                "Which agents can connect?",
                "Use an agent that supports remote MCP connections and OAuth authorization. Add the connection from your workspace, sign in to authorize it, and choose the projects it can access.",
              ],
              [
                "Who can read my transcripts?",
                "Projects are private to your account. A connected agent can read the sources only in the projects you share with it, and you can revoke that access at any time.",
              ],
              [
                "How do I plan a future process?",
                "Keep the current process as As-is, then start a To-be model from a saved As-is revision. Describe the changes you want and revise it with your agent. Each model keeps its own history.",
              ],
              [
                "How do I review the model with my team?",
                "Run Review checks to find structural issues and unanswered questions. Walk through the diagram with the people who do the work, show them the source passages, and save their feedback for the next revision.",
              ],
              [
                "Can I work locally?",
                "Yes. The CLI creates and revises local projects, and exports diagrams and offline review bundles.",
              ],
            ].map(([question, answer], i) => (
              <AccordionItem key={question} value={String(i)}>
                <AccordionTrigger className="py-4">{question}</AccordionTrigger>
                <AccordionContent className="pb-4">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                Bring your next interview.
              </h2>
              <p className="text-lg leading-relaxed text-primary-foreground/80">
                Map the process as it runs today, then plan the one you want.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="lg" asChild>
                <a href="/app">
                  Start a process
                  <ArrowRight data-icon="inline-end" />
                </a>
              </Button>
              <Button
                variant="ghost-inverse"
                size="lg"
                asChild
              >
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
          <a className="underline underline-offset-4" href="/privacy">
            Privacy
          </a>
          <a className="underline underline-offset-4" href="https://github.com/HanifCarroll/Senda">
            Source code
          </a>
        </div>
      </footer>
    </div>
  );
}
