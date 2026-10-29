import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { productName } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Brand } from "./brand";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { InterviewToModel } from "./interview-to-model";
import { PathArt } from "./path-art";
import { PricingPlans } from "./pricing-plans";

const preview = (name: string) => `/marketing/${name}.svg?v=vector-4`;
const repository = "https://github.com/HanifCarroll/Senda";

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const display = "font-display tracking-[-0.02em] text-balance";
const h2 = cn(display, "text-[2.4rem] leading-[1.05] sm:text-[3.4rem]");
const h3 = cn(display, "text-[1.6rem] leading-tight sm:text-[1.9rem]");
const lead = "text-[1.05rem] leading-relaxed text-muted-foreground text-pretty sm:text-lg";
const pill = "h-11 rounded-full px-6 text-[0.95rem]";
const textLink =
  "font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground";
const windowFrame = "overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgb(9_30_38/10%),0_24px_60px_-28px_rgb(9_30_38/35%)]";
const panel = "rounded-[1.75rem] bg-muted";

function StartButtons() {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Button size="lg" className={pill} asChild>
        <a href="/app">
          Start free
          <ArrowRight data-icon="inline-end" />
        </a>
      </Button>
      <Button size="lg" variant="outline" className={cn(pill, "bg-transparent")} asChild>
        <a href="/example">Explore the example</a>
      </Button>
    </div>
  );
}

function WindowBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full bg-border" />
        ))}
      </span>
      <span className="text-[0.8rem] text-muted-foreground">{title}</span>
    </div>
  );
}

const audiences = [
  {
    title: "Process consultants",
    text: "Show your client a model they can check against what their own people said.",
  },
  {
    title: "Business analysts",
    text: "Document how the work runs today before anyone writes requirements or automates it.",
  },
  {
    title: "Operations teams",
    text: "See how work actually passes between roles, then decide how it should run.",
  },
];

const asIs = [
  ["Revision 2", "First draft, seven questions open"],
  ["Revision 3", "Parallel readiness work clarified"],
  ["Revision 4", "Reminder and cancellation paths"],
  ["Revision 5", "Credit-terms rule resolved"],
];

const toBe = [
  ["To-be 1", "Drafted from your design brief"],
  ["To-be 2", "Revised after stakeholder answers"],
];

function RevisionTrack({ name, items, planned = false }: { name: string; items: string[][]; planned?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium">{name}</p>
      <ol className="flex flex-col">
        {items.map(([label, text], i) => (
          <li key={label} className="relative flex gap-4 pb-5 last:pb-0">
            {i < items.length - 1 && (
              <span aria-hidden="true" className="absolute top-4 left-[5px] h-full w-px bg-border" />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2",
                planned ? "border-[var(--brand-teal)] bg-card" : "border-primary bg-primary",
              )}
            />
            <span className="flex flex-col">
              <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
              <span className="text-[0.95rem] leading-snug">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const stories = [
  {
    id: "map",
    nav: "Map today’s process",
    title: "Map the process as it runs today",
    text: "Add the transcript to a private project and ask your agent for a first draft. Every step links to the passage it came from, so anyone can check the draft against the interview.",
    visual: (
      <div className={cn(panel, "px-4 pt-8 sm:px-10 sm:pt-12")}>
        <a
          href="/example?view=FinanceWork&element=Invoice"
          className={cn(windowFrame, "mx-auto block max-w-sm rounded-b-none sm:max-w-none")}
        >
          <picture>
            <source media="(max-width: 640px)" srcSet="/marketing/evidence-mobile.png?v=mobile-1" width="390" height="718" />
            <img
              src={preview("evidence")}
              width="1200"
              height="800"
              loading="lazy"
              alt="A deposit invoice step selected in a client onboarding diagram, with the transcript passage that supports it."
              className="w-full"
            />
          </picture>
        </a>
      </div>
    ),
  },
  {
    id: "clarify",
    nav: "Ask about the gaps",
    title: "Ask about what the interview missed",
    text: "People usually describe their own part of the work and skip how it connects to the next team. When the transcript doesn’t say whether Finance waits for Delivery, your agent records that as a question instead of guessing.",
    quote: "I would want them to confirm whether one is supposed to wait for the other.",
    visual: (
      <div className={cn(panel, "px-4 py-10 sm:px-12 sm:py-16")}>
        <a href="/example?draft=true&section=questions" className={cn(windowFrame, "mx-auto block max-w-xl p-4 sm:p-6")}>
          <img
            src={preview("clarification")}
            width="544"
            height="309"
            loading="lazy"
            alt="An open question asking whether Finance and Delivery start together and what must finish before setup starts."
            className="w-full"
          />
        </a>
      </div>
    ),
  },
  {
    id: "plan",
    nav: "Plan the change",
    title: "Plan the process you want",
    text: "Save each answer, and your agent revises the same model instead of starting over. Senda keeps every revision. Once everyone agrees on the current process, start a To-be plan for the future process and leave the original alone. When you’re done, download standard BPMN.",
    visual: (
      <div className={cn(panel, "px-4 py-10 sm:px-12 sm:py-16")}>
        <div className={cn(windowFrame, "mx-auto max-w-xl")}>
          <WindowBar title="Brightline client onboarding · History" />
          <div className="grid gap-8 p-6 sm:grid-cols-2 sm:p-8">
            <RevisionTrack name="As-is · Current process" items={asIs} />
            <div className="flex flex-col gap-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Started from As-is revision 5 and a design brief.
              </p>
              <RevisionTrack name="To-be · Planned future" items={toBe} planned />
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

function useActiveStory() {
  const [active, setActive] = useState(stories[0].id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    stories.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return active;
}

function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <div className={cn(container, "py-20 sm:py-28")}>{children}</div>
    </section>
  );
}

export function Marketing() {
  const activeStory = useActiveStory();
  return (
    <div className="marketing min-h-dvh">
      <header className="sticky top-0 z-40 px-3 pt-3">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl items-center gap-2 rounded-full border bg-card/85 py-2 pr-2 pl-5 shadow-[0_1px_2px_rgb(9_30_38/6%),0_8px_24px_-12px_rgb(9_30_38/18%)] backdrop-blur-md sm:gap-6"
        >
          <a href="/" className="mr-auto flex items-center">
            <Brand className="h-7 sm:h-8" />
          </a>
          {[
            ["How it works", "#how-it-works"],
            [`Why ${productName}`, "#why-senda"],
            ["Your agent", "#your-agent"],
            ["FAQ", "#questions"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block">
              {label}
            </a>
          ))}
          <a href="#pricing" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">Pricing</a>
          <Button variant="ghost" className="rounded-full px-3 md:ml-2" asChild>
            <a href="/sign-in">Sign in</a>
          </Button>
          <Button className="rounded-full px-4" asChild>
            <a href="/app">Start free</a>
          </Button>
        </nav>
      </header>

      <main>
        <section className={cn(container, "flex flex-col items-center gap-7 pt-20 pb-14 text-center sm:pt-32 sm:pb-20")}>
          <h1 className={cn(display, "max-w-5xl text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-[4.6rem]")}>
            Turn interviews into process diagrams people can agree on.
          </h1>
          <p className={cn(lead, "max-w-xl sm:text-xl")}>
            Bring a transcript. Use Senda’s built-in agent or connect your own. Every step links back to the interview, and
            anything it leaves unclear becomes a question.
          </p>
          <StartButtons />
        </section>

        <div className={container}>
          <PathArt className="px-3 py-6 sm:px-12 sm:py-16 lg:px-20 lg:py-20">
            <InterviewToModel />
          </PathArt>
        </div>

        <Section>
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <h2 className={h2}>For people who map processes by interviewing the team.</h2>
            <ul className="flex flex-col gap-8">
              {audiences.map(({ title, text }) => (
                <li key={title} className="flex flex-col gap-1.5">
                  <h3 className={cn(display, "text-[1.45rem]")}>{title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="how-it-works">
          <h2 className={cn(h2, "max-w-3xl")}>Draft today’s process, fill the gaps, then plan the next one.</h2>
          <div className="mt-16 grid gap-16 lg:mt-20 lg:grid-cols-[200px_1fr] lg:gap-20">
            <nav aria-label="How it works" className="hidden lg:block">
              <ol className="sticky top-32 flex flex-col">
                {stories.map((story) => (
                  <li key={story.id}>
                    <a
                      href={`#${story.id}`}
                      className={cn(
                        "block border-b-2 py-2.5 text-sm transition-colors",
                        activeStory === story.id
                          ? "border-foreground text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {story.nav}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="flex flex-col gap-24 sm:gap-32">
              {stories.map((story) => (
                <article key={story.id} id={story.id} className="flex scroll-mt-28 flex-col gap-8">
                  <div className="flex max-w-2xl flex-col gap-4">
                    <h3 className={h3}>{story.title}</h3>
                    <p className={lead}>{story.text}</p>
                    {story.quote && (
                      <blockquote className="mt-2 border-l-2 border-[var(--brand-teal)] pl-5">
                        <p className={cn(display, "text-[1.35rem] leading-snug")}>“{story.quote}”</p>
                        <footer className="mt-2 text-sm text-muted-foreground">From the onboarding interview</footer>
                      </blockquote>
                    )}
                  </div>
                  {story.visual}
                </article>
              ))}
            </div>
          </div>
        </Section>

        <section id="why-senda" className="scroll-mt-24 bg-primary text-primary-foreground">
          <div className={cn(container, "grid gap-10 py-24 sm:py-32 lg:grid-cols-[1fr_1.1fr] lg:gap-20")}>
            <h2 className={h2}>Why not just ask your AI for a diagram?</h2>
            <div className="flex flex-col gap-6 text-lg leading-relaxed text-primary-foreground/80 sm:text-xl">
              <p>
                Your agent can draw a process from a transcript on its own. It won’t show you which steps it
                guessed, though, and when someone corrects it, you get a new diagram with no record of what
                changed.
              </p>
              <p className="text-primary-foreground">
                With Senda, your agent still does the drafting. Senda links each step to its source, keeps the
                gaps as open questions, and saves every revision.
              </p>
            </div>
          </div>
        </section>

        <Section>
          <ul className="grid gap-12 md:grid-cols-3 md:gap-12">
            {[
              {
                title: "A clear method for process discovery",
                text: (
                  <>
                    Start with the process boundaries, then map the activities, handoffs and decisions.
                    Keep unanswered questions visible and check each change against the interview.
                  </>
                ),
                link: { href: "#how-it-works", label: "See how it works" },
              },
              {
                title: "Know where your transcript goes",
                text: "Built-in chat sends relevant sources and models to DeepSeek. Your connected agent reads only the projects you approve, under its provider’s privacy practices.",
                link: { href: "/privacy", label: "Read the privacy notice" },
              },
              {
                title: "Start free, keep your work",
                text: "Create up to three hosted projects for free with your own agent, or choose Pro for built-in chat and more projects. The app, command-line tool and agent skill are MIT-licensed.",
                link: { href: repository, label: "View the source" },
              },
            ].map(({ title, text, link }) => (
              <li key={title} className="flex flex-col gap-3">
                <h3 className={cn(display, "text-[1.45rem]")}>{title}</h3>
                <p className="flex-1 leading-relaxed text-muted-foreground">{text}</p>
                <a href={link.href} className={cn(textLink, "text-sm")}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="your-agent">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
            <div className="flex flex-col gap-8">
              <h2 className={h2}>Connect the AI agent you already use.</h2>
              <p className={lead}>
                Your agent reads the transcript, drafts the model and revises it from your answers. Senda keeps
                the diagram, the transcripts and every revision in one project, so the work doesn’t disappear
                when the chat ends.
              </p>
              <ol className="flex flex-col gap-5">
                {[
                  ["Connect", "Add Senda in ChatGPT or Claude’s connection settings, then sign in and allow it to create new projects."],
                  ["Share", "Give your agent the interview transcript and ask it to map the process in Senda. It creates the project and asks about missing details."],
                  ["Review", "Answer questions and request changes in the same chat. Open Senda to explore the diagram, compare revisions and export the result."],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-5">
                    <span className={cn(display, "w-5 text-[1.45rem] leading-none text-muted-foreground tabular-nums")}>{i + 1}</span>
                    <p className="leading-relaxed">
                      <span className="font-medium">{title}.</span>{" "}
                      <span className="text-muted-foreground">{text}</span>
                    </p>
                  </li>
                ))}
              </ol>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Claude is supported. ChatGPT is in beta: it can save a change but sometimes cannot display its reply. Check the saved diagram before repeating a request.{" "}
                Works with any AI agent that can connect to a remote MCP server with OAuth sign-in (many assistants
                call this a custom connector). If you prefer
                a terminal, the{" "}
                <a href={`${repository}#cli-quickstart`} className={textLink}>
                  command-line tool and skill
                </a>{" "}
                work with local projects.
              </p>
            </div>
            <div className={cn(panel, "flex items-center px-4 py-10 sm:px-10 sm:py-14")}>
              <div className={cn(windowFrame, "w-full")}>
                <WindowBar title="Your agent" />
                <div className="flex flex-col gap-4 p-5 sm:p-6">
                  <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[0.95rem] leading-relaxed text-primary-foreground">
                    Here are my client onboarding interview notes. Could you map the process in Senda
                    and ask me about anything unclear?
                  </div>
                  <div className="mr-6 flex flex-col gap-3 rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-[0.95rem] leading-relaxed">
                    <p>
                      I saved revision 2, a first draft with each step linked to its passage. Seven questions are
                      open. The first one decides the shape of the diagram:
                    </p>
                    <p className="border-l-2 border-[var(--brand-teal)] pl-3 font-medium">
                      Can Finance and Delivery start together, and what must finish before setup starts?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section id="pricing">
          <div className="flex flex-col gap-10 sm:gap-12">
            <div className="flex max-w-2xl flex-col gap-5">
              <h2 className={h2}>Start free. Add built-in AI with Pro.</h2>
              <p className={lead}>Use your own connected agent on Free, or work directly with the Senda agent in Pro.</p>
            </div>
            <PricingPlans />
          </div>
        </Section>

        <Section id="questions">
          <div className="grid gap-10 md:grid-cols-[0.75fr_1.25fr] md:gap-16">
            <h2 className={h2}>Questions</h2>
            <Accordion type="single" collapsible className="border-t">
              {[
                [
                  "What kind of diagram do I get?",
                  "A BPMN 2.0 process model, the standard notation for activities, decisions, responsibilities and handoffs. You can explore it in Senda or download a .bpmn file with its layout. Exports are tested with bpmn-js, the open-source modeler behind bpmn.io.",
                ],
                [
                  "Can I start in ChatGPT or Claude?",
                  "Yes. Claude is supported and ChatGPT is in beta. Connect Senda, sign in and choose New projects. Give your agent the transcript and ask it to map the process. Continue answering questions in the same chat and review the saved diagram in Senda. ChatGPT can save changes but fail to display its reply, so check the saved model before repeating a request.",
                ],
                [
                  "Which AI agents can connect?",
                  "Any agent that can add a remote MCP server and sign in with OAuth. Some assistants call this a custom connector. Add Senda’s server URL, sign in, and allow new projects or select an existing one. Coding agents can also use the command-line tool with the downloadable skill.",
                ],
                [
                  "Does Senda run AI on my transcripts?",
                  "When you choose the built-in agent in Pro, Senda sends relevant messages, sources and models to DeepSeek Flash. If you connect your own agent, that agent and its provider do the drafting. Senda keeps the evidence and revision history in either workflow.",
                ],
                [
                  "Who can read my transcripts?",
                  "Projects are private to your account. A connected agent can read the sources only in the projects you share with it, and you can disconnect it at any time.",
                ],
                [
                  "Is it free?",
                  "Free lets you create up to three saved cloud projects with your own agent. Pro is $29 USD per month for up to 100 projects and built-in chat with a monthly AI allowance. Daily and shared service limits apply, with no automatic overage charges. Read Pricing for details. The source is MIT-licensed.",
                ],
                [
                  "How do I plan a future process?",
                  "Keep the current process as As-is, then start a To-be model from a saved As-is revision. Describe the changes you want and revise it with your agent. Each model keeps its own history.",
                ],
                [
                  "How do I review the model with my team?",
                  "Run Review checks to find structural problems and unanswered questions. Then walk through the diagram with the people who do the work, show them the source passages, and save their feedback for the next revision.",
                ],
                [
                  "Can I work locally?",
                  "Yes. The command-line tool creates and revises local projects, and exports diagrams and offline review bundles.",
                ],
              ].map(([question, answer], i) => (
                <AccordionItem key={question} value={String(i)}>
                  <AccordionTrigger className="py-5 text-base font-normal sm:text-[1.05rem]">{question}</AccordionTrigger>
                  <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Section>

        <section className={cn(container, "flex flex-col items-center gap-6 pt-8 pb-28 text-center sm:pb-36")}>
          <h2 className={cn(display, "text-[2.8rem] leading-[1.02] sm:text-[4.2rem]")}>Bring your next interview.</h2>
          <p className={cn(lead, "max-w-md")}>Map how the process runs today, then plan the one you want.</p>
          <StartButtons />
        </section>
      </main>

      <footer>
        <div className={cn(container, "flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted-foreground")}>
          <span>
            {productName} · Built by{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="https://hanifcarroll.com">
              Hanif Carroll
            </a>
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              ["Example", "/example"],
              ["Pricing", "#pricing"],
              ["Usage", "/usage"],
              ["How it works", "#how-it-works"],
              ["Privacy", "/privacy"],
              ["Source code", repository],
            ].map(([label, href]) => (
              <a key={label} className="underline underline-offset-4 hover:text-foreground" href={href}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
