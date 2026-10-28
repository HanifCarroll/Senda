import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  ClipboardList,
  Download,
  GitBranch,
  History,
  ShieldCheck,
  Users,
  Code,
} from "lucide-react";
import { productName } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Brand, BrandMark } from "./brand";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { InterviewToModel } from "./interview-to-model";

const preview = (name: string) => `/marketing/${name}.svg?v=vector-3`;
const repository = "https://github.com/HanifCarroll/Senda";
const methodology = `${repository}/blob/main/skills/process-scribe/references/methodology.md`;

const navLink = "hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block";
const heading = "text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2.6rem]";
const lead = "text-lg leading-relaxed text-muted-foreground text-pretty";
const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const frame =
  "overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(20_61_77/6%),0_18px_44px_-18px_rgb(20_61_77/24%)]";
const textLink = "font-medium text-primary underline decoration-[var(--brand-teal)]/40 underline-offset-4 hover:decoration-[var(--brand-teal)]";

function SectionHeading({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-4", className)}>
      <h2 className={heading}>{title}</h2>
      {children && <p className={lead}>{children}</p>}
    </div>
  );
}

function StartButtons({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button size="lg" variant={inverse ? "secondary" : "default"} className="h-11 px-5 text-[0.95rem]" asChild>
        <a href="/app">
          Start free
          <ArrowRight data-icon="inline-end" />
        </a>
      </Button>
      <Button
        size="lg"
        variant={inverse ? "ghost-inverse" : "outline"}
        className={cn("h-11 px-5 text-[0.95rem]", !inverse && "bg-card")}
        asChild
      >
        <a href="/example">Explore the example</a>
      </Button>
    </div>
  );
}

const audiences = [
  {
    Icon: Briefcase,
    title: "Process consultants",
    text: "Turn discovery interviews into a model your client can check, step by step, against what their people said.",
  },
  {
    Icon: ClipboardList,
    title: "Business analysts",
    text: "Document the current state before requirements, system changes or automation work begin.",
  },
  {
    Icon: Users,
    title: "Operations teams",
    text: "Capture how work actually runs across roles, then agree on how it should run next.",
  },
];

const workflow = [
  {
    title: "Add the interview",
    text: "Create a private project, paste or upload the transcript, and name the process you want to understand.",
  },
  {
    title: "Map how it works today",
    text: "Your agent drafts the As-is model, links each step to its passage, and flags what the interview left unclear.",
  },
  {
    title: "Settle the open questions",
    text: "Take the questions back to the people who do the work. Save their answers and revise the same model.",
  },
  {
    title: "Plan how it should work",
    text: "Start a To-be model from a saved As-is revision, describe the changes, and revise it on its own track.",
  },
];

const comparison = [
  {
    topic: "Where each step comes from",
    chat: "Whatever the model inferred from the conversation",
    senda: "Linked to the exact transcript passage that supports it",
  },
  {
    topic: "What the interview left out",
    chat: "Often filled with a plausible guess",
    senda: "Raised as a question for the people who know the answer",
  },
  {
    topic: "What you take away",
    chat: "XML or a picture you check and redraw by hand",
    senda: "Validated BPMN 2.0 with layout, ready for your modeling tool",
  },
  {
    topic: "The next round of changes",
    chat: "A new answer, with no record of what changed",
    senda: "The same model revised, with every revision saved and compared",
  },
  {
    topic: "Today versus the plan",
    chat: "One diagram",
    senda: "Separate As-is and To-be models, each with its own history",
  },
];

const asIs = [
  { label: "Revision 2", text: "First draft, seven questions open" },
  { label: "Revision 3", text: "Parallel readiness work clarified" },
  { label: "Revision 4", text: "Reminder and cancellation paths" },
  { label: "Revision 5", text: "Credit-terms rule resolved" },
];

const toBe = [
  { label: "To-be 1", text: "Drafted from your design brief" },
  { label: "To-be 2", text: "Revised after stakeholder answers" },
];

function RevisionTrack({
  name,
  items,
  tone,
}: {
  name: string;
  items: { label: string; text: string }[];
  tone: "current" | "planned";
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold">{name}</p>
      <ol className="relative flex flex-col gap-4 border-l-2 border-dashed border-border pl-6 sm:flex-row sm:gap-0 sm:border-t-2 sm:border-l-0 sm:pt-6 sm:pl-0">
        {items.map((item, i) => (
          <li key={item.label} className="relative flex flex-1 flex-col gap-0.5 sm:pr-4">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1 -left-[1.95rem] size-3.5 rounded-full border-2 sm:-top-[2.05rem] sm:left-0",
                tone === "current" ? "border-primary bg-primary" : "border-[var(--brand-teal)] bg-card",
                i === items.length - 1 && tone === "current" && "ring-4 ring-[var(--brand-tint)]",
              )}
            />
            <span className="text-xs font-medium text-muted-foreground tabular-nums">{item.label}</span>
            <span className="text-sm leading-snug">{item.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Marketing() {
  return (
    <div className="bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <nav aria-label="Main navigation" className={cn(container, "flex items-center gap-2 py-3.5 sm:gap-5")}>
          <a href="/" className="mr-auto flex items-center">
            <Brand className="h-8 sm:h-9" />
          </a>
          <a href="#how-it-works" className={navLink}>
            How it works
          </a>
          <a href="#why-senda" className={navLink}>
            Why {productName}
          </a>
          <a href="#your-agent" className={navLink}>
            Your agent
          </a>
          <a href="#questions" className={navLink}>
            FAQ
          </a>
          <Button variant="ghost" className="px-2 sm:px-3" asChild>
            <a href="/sign-in">Sign in</a>
          </Button>
          <Button asChild>
            <a href="/app">Start free</a>
          </Button>
        </nav>
      </header>

      <main>
        <section className="marketing-hero">
          <div className={cn(container, "flex flex-col items-center gap-7 pt-16 pb-16 text-center sm:pt-24 sm:pb-24")}>
            <h1 className="max-w-4xl text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[4.25rem]">
              Turn process interviews into diagrams people can agree on.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl">
              For consultants, analysts and operations teams who map processes from interviews. Bring a
              transcript and your own AI agent. Every step stays tied to what people said, gaps become
              questions, and you export standard BPMN.
            </p>
            <StartButtons />
            <figure className="mt-6 w-full sm:mt-10">
              <InterviewToModel />
              <figcaption className="mt-4 text-sm text-muted-foreground">
                From the onboarding example, with its Finance subprocess simplified.{" "}
                <a href="/example?view=FinanceWork&element=Invoice" className={textLink}>
                  Open the full model
                </a>
              </figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="audience-heading" className="border-y bg-card">
          <div className={cn(container, "grid gap-10 py-12 sm:py-14 lg:grid-cols-[0.75fr_2fr] lg:gap-12")}>
            <h2 id="audience-heading" className="text-xl leading-snug font-semibold tracking-tight text-balance">
              Built for people who map processes from conversations.
            </h2>
            <ul className="grid gap-8 sm:grid-cols-3">
              {audiences.map(({ Icon, title, text }) => (
                <li key={title} className="flex flex-col gap-2">
                  <Icon className="size-5 text-[var(--brand-teal)]" aria-hidden="true" />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16">
          <div className={cn(container, "flex flex-col gap-12 py-20 sm:py-24")}>
            <SectionHeading title="From one conversation to the process you want next." />
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-3 rounded-xl border bg-card p-6">
                  <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-tint)] text-sm font-semibold text-primary tabular-nums">
                    {i + 1}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t bg-card">
          <div className={cn(container, "flex flex-col gap-12 py-20 sm:py-24")}>
            <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-12">
              <SectionHeading title="Every step shows where it came from." />
              <p className={lead}>
                Select a step to read its supporting quotes and the source passage in context. When
                someone asks “who said that?”, the answer is one click away.
              </p>
            </div>
            <figure className="mx-auto w-full max-w-sm sm:max-w-none">
              <a href="/example?view=FinanceWork&element=Invoice" className={cn(frame, "block bg-muted p-1.5 sm:p-2.5")}>
                <picture>
                  <source media="(max-width: 640px)" srcSet={preview("evidence-mobile")} width="390" height="718" />
                  <img
                    src={preview("evidence")}
                    width="1200"
                    height="800"
                    loading="lazy"
                    alt="A deposit invoice step selected in a client onboarding diagram, with the transcript passage that supports it."
                    className="w-full rounded-lg"
                  />
                </picture>
              </a>
              <figcaption className="mt-4 text-center text-sm text-muted-foreground">
                Every step links to the interview passage behind it.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="border-t">
          <div className={cn(container, "grid gap-12 py-20 sm:py-24 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-16")}>
            <div className="flex flex-col gap-6">
              <SectionHeading title="Find the decisions the interview skipped.">
                An interview can describe two teams’ work without saying whether one waits for the other.
                Gaps like that become specific questions in the project, so the answer goes into the next
                revision instead of a guess.
              </SectionHeading>
              <blockquote className="border-l-2 border-[var(--brand-teal)] pl-5 text-lg leading-relaxed">
                “I would want them to confirm whether one is supposed to wait for the other.”
                <footer className="mt-2 text-sm text-muted-foreground">Maya, onboarding coordinator</footer>
              </blockquote>
            </div>
            <figure>
              <a href="/example?draft=true&section=questions" className={cn(frame, "block p-4 sm:p-6")}>
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
                Copy the question for your next conversation, or prepare the answer once you have it.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="border-t bg-card">
          <div className={cn(container, "grid gap-12 py-20 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16")}>
            <div className="flex flex-col gap-8">
              <SectionHeading title="One model that improves with every answer.">
                Save an answer and ask your agent to revise the same diagram. When the current process is
                settled, start a separate To-be plan from it without touching the original.
              </SectionHeading>
              <ul className="flex flex-col gap-4">
                {[
                  { Icon: History, text: "Revisit any revision and read what changed in plain language." },
                  { Icon: GitBranch, text: "Keep the current process and the future plan on separate tracks." },
                  { Icon: Download, text: "Download a .bpmn file with layout for your modeling tool." },
                ].map(({ Icon, text }) => (
                  <li key={text} className="flex gap-3 leading-relaxed">
                    <Icon className="mt-1 size-5 shrink-0 text-[var(--brand-teal)]" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-8 rounded-2xl border bg-background p-6 sm:p-8">
              <RevisionTrack name="As-is · Current process" items={asIs} tone="current" />
              <p className="flex items-center gap-2 rounded-lg bg-[var(--brand-tint)]/60 px-3.5 py-2.5 text-sm">
                <GitBranch className="size-4 shrink-0 text-[var(--brand-teal)]" aria-hidden="true" />
                Start a To-be plan from As-is revision 5 and a design brief
              </p>
              <RevisionTrack name="To-be · Planned future" items={toBe} tone="planned" />
            </div>
          </div>
        </section>

        <section id="why-senda" className="scroll-mt-16 border-t">
          <div className={cn(container, "flex flex-col gap-12 py-20 sm:py-24")}>
            <SectionHeading title="Why not just ask a chatbot for a diagram?">
              A chat can draw a plausible process. Getting people to agree on it takes evidence, follow-up
              questions and a record of what changed.
            </SectionHeading>
            <div className="overflow-hidden rounded-2xl border bg-card" role="table" aria-label={`A single chat compared with ${productName}`}>
              <div role="row" className="hidden grid-cols-[0.9fr_1fr_1fr] border-b bg-muted/60 text-sm font-semibold md:grid">
                <span role="columnheader" className="px-6 py-4">
                  <span className="sr-only">Topic</span>
                </span>
                <span role="columnheader" className="px-6 py-4 text-muted-foreground">
                  A diagram from a single chat
                </span>
                <span role="columnheader" className="flex items-center gap-2 px-6 py-4 text-primary">
                  <BrandMark className="h-4" />
                  {productName}
                </span>
              </div>
              {comparison.map((row) => (
                <div
                  role="row"
                  key={row.topic}
                  className="grid gap-3 border-b px-5 py-5 last:border-b-0 md:grid-cols-[0.9fr_1fr_1fr] md:gap-0 md:p-0"
                >
                  <span role="rowheader" className="font-semibold md:px-6 md:py-5">
                    {row.topic}
                  </span>
                  <span role="cell" className="text-muted-foreground md:px-6 md:py-5">
                    <span className="mb-0.5 block text-xs font-medium tracking-wide uppercase md:hidden">Single chat</span>
                    {row.chat}
                  </span>
                  <span role="cell" className="flex gap-2.5 md:bg-[var(--brand-tint)]/30 md:px-6 md:py-5">
                    <Check className="mt-1 size-4 shrink-0 text-[var(--brand-teal)]" aria-hidden="true" />
                    <span>
                      <span className="mb-0.5 block text-xs font-medium tracking-wide text-primary uppercase md:hidden">
                        {productName}
                      </span>
                      {row.senda}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {[
                {
                  Icon: BookOpen,
                  title: "Built on an established method",
                  text: (
                    <>
                      Discovery follows Chapter 5 of <cite>Fundamentals of Business Process Management</cite>:
                      boundaries, activities, handoffs, then control flow, with review throughout.
                    </>
                  ),
                  link: { href: methodology, label: "Read the method summary" },
                },
                {
                  Icon: ShieldCheck,
                  title: "Your transcripts, your agent",
                  text: "Senda doesn’t send your transcripts to an AI model. Only the agent you authorize reads them, for the projects you choose, and you can revoke access at any time.",
                  link: { href: "/privacy", label: "Read the privacy notice" },
                },
                {
                  Icon: Code,
                  title: "Free and open source",
                  text: "Use the hosted app at no cost, or run it yourself. The app, command-line tool and agent skill are MIT-licensed.",
                  link: { href: repository, label: "View the source" },
                },
              ].map(({ Icon, title, text, link }) => (
                <li key={title} className="flex flex-col gap-3 rounded-xl border bg-card p-6">
                  <Icon className="size-5 text-[var(--brand-teal)]" aria-hidden="true" />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                  <a href={link.href} className={cn(textLink, "text-sm")}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="your-agent" className="scroll-mt-16 border-t bg-card">
          <div className={cn(container, "grid gap-12 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16")}>
            <div className="flex flex-col gap-8">
              <SectionHeading title="Keep working with the agent you already use.">
                Your agent reads the transcript, drafts the model and revises it from your answers. Senda
                keeps the diagram, sources and history together so nothing lives only in a chat.
              </SectionHeading>
              <ol className="flex flex-col gap-5">
                {[
                  {
                    title: "Connect",
                    text: "In a project, open Connect your agent and add the server URL to your agent’s connector settings.",
                  },
                  {
                    title: "Authorize",
                    text: "Sign in when your agent asks, and choose the projects it may open.",
                  },
                  {
                    title: "Ask",
                    text: "Give it the discovery method from the same screen and ask it to model the interview.",
                  },
                ].map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--brand-teal)] text-xs font-semibold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <p className="leading-relaxed">
                      <span className="font-semibold">{step.title}.</span>{" "}
                      <span className="text-muted-foreground">{step.text}</span>
                    </p>
                  </li>
                ))}
              </ol>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Works with AI agents that can add a remote MCP server and sign in with OAuth. Prefer to work
                from a terminal? Use the{" "}
                <a href={`${repository}#cli-quickstart`} className={textLink}>
                  command-line tool and skill
                </a>{" "}
                with local projects.
              </p>
            </div>
            <figure className="flex flex-col gap-3 self-center">
              <div className="flex flex-col gap-4 rounded-2xl border bg-background p-5 sm:p-6">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Example conversation</p>
                <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[0.95rem] leading-relaxed text-primary-foreground">
                  Model the Brightline onboarding interview as the current process. Ask me about missing
                  decisions and keep the evidence attached.
                </div>
                <div className="mr-8 flex flex-col gap-3 rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-[0.95rem] leading-relaxed">
                  <p>
                    I saved revision 2, a first draft with each step linked to its passage. Seven questions are
                    open. The first one decides the shape of the diagram:
                  </p>
                  <p className="border-l-2 border-[var(--brand-teal)] pl-3 font-medium">
                    Can Finance and Delivery start together, and what must finish before setup starts?
                  </p>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <BrandMark className="h-3.5" />
                    Brightline client onboarding
                  </span>
                  <span>Revision 2 saved</span>
                  <span>7 open questions</span>
                </p>
              </div>
              <figcaption className="text-sm text-muted-foreground">
                Based on the first draft in the{" "}
                <a href="/example?draft=true" className={textLink}>
                  onboarding example
                </a>
                .
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="questions" className={cn(container, "grid scroll-mt-16 gap-10 py-20 sm:py-24 md:grid-cols-[0.7fr_1.3fr]")}>
          <h2 className={heading}>Questions</h2>
          <Accordion type="single" collapsible>
            {[
              [
                "What kind of diagram do I get?",
                "A BPMN 2.0 process model, the standard notation for activities, decisions, responsibilities and handoffs. Explore it in Senda, or download a .bpmn file with its layout. Exports are tested with bpmn-js, the open-source modeler behind bpmn.io.",
              ],
              [
                "Which AI agents can connect?",
                "Any agent that can add a remote MCP server and sign in with OAuth. Some assistants call this a custom connector. Add Senda’s server URL, sign in, and choose the projects it may open. Coding agents can also use the command-line tool with the downloadable skill.",
              ],
              [
                "Does Senda run AI on my transcripts?",
                "No. Senda stores your transcripts, model and history, and checks each revision. The agent you connect does the reading and drafting.",
              ],
              [
                "Who can read my transcripts?",
                "Projects are private to your account. A connected agent can read the sources only in the projects you share with it, and you can revoke that access at any time.",
              ],
              [
                "Is it free?",
                "Yes. The hosted app is free to use and the source is MIT-licensed. Each project holds up to 40 sources and 1 MB of transcript text.",
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
                "Yes. The command-line tool creates and revises local projects, and exports diagrams and offline review bundles.",
              ],
            ].map(([question, answer], i) => (
              <AccordionItem key={question} value={String(i)}>
                <AccordionTrigger className="py-4 text-base">{question}</AccordionTrigger>
                <AccordionContent className="pb-4 text-base leading-relaxed text-muted-foreground">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="bg-primary text-primary-foreground">
          <div className={cn(container, "flex flex-col items-start gap-8 py-16 sm:py-20 md:flex-row md:items-center md:justify-between")}>
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-[2.6rem]">
                Bring your next interview.
              </h2>
              <p className="text-lg leading-relaxed text-primary-foreground/80">
                Map the process as it runs today, then plan the one you want.
              </p>
            </div>
            <StartButtons inverse />
          </div>
        </section>
      </main>

      <footer className={cn(container, "flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted-foreground")}>
        <span>
          {productName} · Built by{" "}
          <a className="underline underline-offset-4 hover:text-foreground" href="https://hanifcarroll.com">
            Hanif Carroll
          </a>
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {[
            ["Example", "/example"],
            ["Method", methodology],
            ["Privacy", "/privacy"],
            ["Source code", repository],
          ].map(([label, href]) => (
            <a key={label} className="underline underline-offset-4 hover:text-foreground" href={href}>
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
