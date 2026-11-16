import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { productName } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Brand } from "./brand";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { InterviewToModel } from "./interview-to-model";
import { PathArt } from "./path-art";
import { PricingPlans } from "./pricing-plans";

// Bump the version when public/marketing changes (docs/marketing-design.md, "Sharp product previews").
const capture = (file: string) => `/marketing/${file}?v=7`;
const repository = "https://github.com/HanifCarroll/Senda";
const methodology = `${repository}/blob/main/skills/senda/references/methodology.md`;

const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const display = "font-display tracking-[-0.02em] text-balance";
const h2 = cn(display, "text-[2.4rem] leading-[1.05] sm:text-[3.4rem]");
const intro = "text-xl leading-relaxed text-pretty";
const pill = "h-12 rounded-full px-6 text-base";
const textLink =
  "font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground";
const windowFrame = "overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgb(9_30_38/10%),0_24px_60px_-28px_rgb(9_30_38/35%)]";
// Cream panel behind a product view. Phones drop it so the capture gets the full container width.
const panel = "sm:rounded-[1.75rem] sm:bg-muted sm:p-10";
// Centered paragraphs are hard to read on a phone, so shared sections align left below sm.
const centered = "sm:text-center";

function WindowBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full bg-border" />
        ))}
      </span>
      <span className={"text-sm text-muted-foreground"}>{title}</span>
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
      <p className={"font-medium"}>{name}</p>
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
              <span className={"text-sm text-muted-foreground tabular-nums"}>{label}</span>
              <span className={"leading-snug"}>{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Buttons({ main = "start" }: { main?: "start" | "example" }) {
  const style = (name: string) => (name === main ? "default" : "outline");
  return (
    <div data-cta className="flex flex-wrap justify-center gap-3">
      <Button size="lg" variant={style("start")} className={cn(pill, main !== "start" && "bg-transparent")} asChild>
        <a href="/app">
          Start free
          {main === "start" && <ArrowRight data-icon="inline-end" />}
        </a>
      </Button>
      <Button size="lg" variant={style("example")} className={cn(pill, main !== "example" && "bg-transparent")} asChild>
        <a href="/example">
          Explore the example
          {main === "example" && <ArrowRight data-icon="inline-end" />}
        </a>
      </Button>
    </div>
  );
}

function SectionHeading({ headline, children, dark }: { headline: string; children?: ReactNode; dark?: boolean }) {
  return (
    <div className={cn("mx-auto flex max-w-[720px] flex-col gap-6", centered)}>
      <h2 className={h2}>{headline}</h2>
      {children && <p className={cn(intro, dark ? "text-primary-foreground/80" : "text-muted-foreground")}>{children}</p>}
    </div>
  );
}

type Point = { title: string; text: string };

// The one template every section between the hero and the FAQ uses: a centered headline and intro,
// one full-width visual, and up to three points. docs/marketing-design.md has the word and type rules.
function MarketingSection({
  name, id, headline, intro: introText, visual, points, dark, children,
}: {
  name: string;
  id?: string;
  headline: string;
  intro?: ReactNode;
  visual?: ReactNode;
  points?: Point[];
  dark?: boolean;
  children?: ReactNode;
}) {
  return (
    <section id={id} data-section={name} className={cn("scroll-mt-24", dark && "bg-primary text-primary-foreground")}>
      <div className={cn(container, "flex flex-col gap-12 py-20 sm:gap-16 sm:py-28")}>
        <SectionHeading headline={headline} dark={dark}>{introText}</SectionHeading>
        {visual}
        {points && (
          <ul className={cn("grid gap-8 md:grid-cols-3 md:gap-10", centered)}>
            {points.map(({ title, text }) => (
              <li key={title} className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className={cn("leading-relaxed", dark ? "text-primary-foreground/80" : "text-muted-foreground")}>{text}</p>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </section>
  );
}

const evidence = (
  <div className={panel}>
    <a
      href="/example?view=FinanceWork&element=Invoice"
      data-visual
      data-capture="evidence"
      className={cn(windowFrame, "mx-auto block max-lg:max-w-[390px]")}
    >
      <picture>
        <source media="(max-width: 359px)" srcSet={capture("evidence-mobile-small.png")} width="280" height="646" />
        <source media="(max-width: 1023px)" srcSet={capture("evidence-mobile.png")} width="350" height="646" />
        <img
          src={capture("evidence.svg")}
          width="1008"
          height="620"
          loading="lazy"
          alt="A deposit invoice step selected in a client onboarding diagram, with the transcript passage that supports it."
          className="w-full"
        />
      </picture>
    </a>
  </div>
);

const questions = (
  <div className={cn(panel, "flex flex-col gap-8 sm:gap-10")}>
    <blockquote className="mx-auto w-full max-w-[768px] border-l-2 border-[var(--brand-teal)] pl-5">
      <p className={cn(display, "text-[1.5rem] leading-snug sm:text-[1.75rem]")}>
        “I would want them to confirm whether one is supposed to wait for the other.”
      </p>
      <footer className="mt-2 text-muted-foreground">From the onboarding interview</footer>
    </blockquote>
    <a
      href="/example?draft=true&section=questions"
      data-visual
      data-capture="clarification"
      className={cn(windowFrame, "mx-auto block w-full max-w-[768px] p-2 max-[860px]:max-w-[350px] min-[861px]:p-6")}
    >
      <picture>
        <source media="(max-width: 359px)" srcSet={capture("clarification-mobile-small.png")} width="264" height="381" />
        <source media="(max-width: 860px)" srcSet={capture("clarification-mobile.png")} width="334" height="341" />
        <img
          src={capture("clarification.svg")}
          width="720"
          height="229"
          loading="lazy"
          alt="An open question asking whether Finance and Delivery start together and what must finish before setup starts."
          className="w-full"
        />
      </picture>
    </a>
  </div>
);

const history = (
  <div className={panel}>
    <div data-visual className={cn(windowFrame, "mx-auto max-w-4xl")}>
      <WindowBar title="Brightline client onboarding · History" />
      <div className="grid gap-8 p-6 sm:grid-cols-2 sm:p-10">
        <RevisionTrack name="As-is · Current process" items={asIs} />
        <div className="flex flex-col gap-6">
          <p className="leading-relaxed text-muted-foreground">Started from As-is revision 5 and a design brief.</p>
          <RevisionTrack name="To-be · Planned future" items={toBe} planned />
        </div>
      </div>
    </div>
  </div>
);

const chat = (
  <div className={panel}>
    <div data-visual className={cn(windowFrame, "mx-auto max-w-2xl")}>
      <WindowBar title="Your agent" />
      <div className="flex flex-col gap-4 p-5 leading-relaxed sm:p-6">
        <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground">
          Here are my client onboarding interview notes. Could you map the process in Senda and ask me about anything
          unclear?
        </div>
        <div className="mr-6 flex flex-col gap-3 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
          <p>
            I saved revision 2, a first draft with each step linked to its passage. Seven questions are open. The first
            one decides the shape of the diagram:
          </p>
          <p className="border-l-2 border-[var(--brand-teal)] pl-3 font-medium">
            Can Finance and Delivery start together, and what must finish before setup starts?
          </p>
        </div>
      </div>
    </div>
  </div>
);

const headerLinks = [
  [`Why ${productName}`, "#why-senda"],
  ["How it works", "#how-it-works"],
  ["Your agent", "#your-agent"],
  ["FAQ", "#questions"],
];

function MarketingHeader() {
  return (
  <header className="sticky top-0 z-40 px-3 pt-5">
    <nav
      aria-label="Main navigation"
      className="mx-auto flex max-w-6xl items-center gap-2 rounded-full border bg-card/85 py-2 pr-2 pl-5 shadow-[0_1px_2px_rgb(9_30_38/6%),0_8px_24px_-12px_rgb(9_30_38/18%)] backdrop-blur-md sm:gap-6"
    >
      <a href="/" className="mr-auto flex items-center">
        <Brand className="h-7 sm:h-8" />
      </a>
      {headerLinks.map(([label, href]) => (
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
  );
}

const footerLinks = [
  ["Example", "/example"],
  ["Pricing", "#pricing"],
  ["How it works", "#how-it-works"],
  ["Method", methodology],
  ["Privacy", "/privacy"],
  ["GitHub", repository],
];

function MarketingFooter() {
  return (
  <footer>
    <div className={cn(container, "flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted-foreground")}>
      <span>
        {productName} · Built by{" "}
        <a className="underline underline-offset-4 hover:text-foreground" href="https://hanifcarroll.com">
          Hanif Carroll
        </a>
      </span>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {footerLinks.map(([label, href]) => (
          <a key={label} className="underline underline-offset-4 hover:text-foreground" href={href}>
            {label}
          </a>
        ))}
      </div>
    </div>
  </footer>
  );
}

const faqs = [
    {
      question: "What kind of diagram do I get?",
      answer: "A BPMN 2.0 process model, the standard notation for activities, decisions, responsibilities and handoffs. You can explore it in Senda or download a .bpmn file with its layout. Exports are tested with bpmn-js, the open-source modeler behind bpmn.io.",
    },
    {
      question: "Which agent should I use?",
      answer: "Start with Senda’s built-in agent, which you can try free on one project and use on every project with Pro. You can also connect your own Claude, ChatGPT (beta) or another assistant that supports custom connectors, on either plan: add Senda in its connection settings, sign in, and ask it to map the interview. Your assistant’s subscription is separate. Coding agents can use the command-line tool with the downloadable skill.",
    },
    {
      question: "Is it free?",
      answer: <>Free includes a one-project trial of the built-in agent with a $0.50 lifetime allowance. You can keep up to three cloud projects with your own agent. Pro is $29 USD per month for up to 100 projects and a $6 monthly built-in AI allowance. Daily and shared service limits apply, with no automatic overage charges. <a href="#pricing" className={textLink}>Compare plans</a>. The source is MIT-licensed.</>,
    },
    {
      question: "How much built-in AI is included?",
      answer: <>Free includes a $0.50 lifetime allowance on one project; Pro includes $6 per month across your projects. Usage follows Senda’s fixed rate card and varies with the work. At a limit, the built-in agent pauses. Your saved work stays readable, exportable and editable with your connected agent. Daily and shared service limits also apply. Nothing extra is bought or charged automatically. <a href="/usage" className={textLink}>Read the usage policy</a>.</>,
    },
    {
      question: "Who can see my transcripts?",
      answer: <>Projects are private to your account. The built-in agent sends relevant messages, sources and models to its AI provider, named in the <a href="/privacy" className={textLink}>privacy notice</a>. With a connected agent, that agent and its provider do the drafting. It can read only the projects you share with it, and you can disconnect it at any time.</>,
    },
    {
      question: "What counts as a project?",
      answer: "A project holds its sources, As-is model and separate To-be model. Free lets you keep up to three projects at a time. Delete one from its project menu to free a slot. You can restore it within seven days if you have room; after that, its content is permanently erased. Deleting a project does not reset your free trial or Pro allowance.",
    },
  ];

export function Marketing() {
  return (
    <div className="marketing min-h-dvh">
      <MarketingHeader />

      <main>
        <section data-section="hero" className={cn(container, "flex flex-col items-center gap-7 pt-20 pb-14 text-center sm:pt-32 sm:pb-20")}>
          <h1 className={cn(display, "max-w-5xl text-[2.9rem] leading-[1.02] sm:text-6xl lg:text-[4.6rem]")}>
            Turn interviews into process diagrams people can agree on.
          </h1>
          <p className="max-w-2xl text-[1.375rem] leading-relaxed text-pretty text-muted-foreground">
            Add an interview transcript, and an agent drafts the process. Every step links to the passage it came from,
            so anyone can check it.
          </p>
          <Buttons />
          <p className="text-muted-foreground">Free plan. No payment card needed.</p>
        </section>

        <div className={container}>
          <PathArt className="px-2 py-4 sm:px-12 sm:py-16 lg:px-20 lg:py-20">
            <div data-visual data-hero-drawing>
              <InterviewToModel />
            </div>
          </PathArt>
        </div>

        <MarketingSection
          name="audience"
          headline="For people who map processes by interviewing the team."
          points={audiences}
        />

        <MarketingSection
          name="why"
          id="why-senda"
          dark
          headline="Why not just ask your AI for a diagram?"
          intro="Your AI can draw a process from a transcript. You can’t see which steps it guessed, though, and when someone corrects it, you get a new diagram with no record of what changed. With Senda, an agent still does the drafting, and you can check its work."
        />

        <MarketingSection
          name="evidence"
          id="how-it-works"
          headline="Every step links to what was said."
          intro="Add a transcript and ask for a first draft. Each step in the diagram points to the part of the interview that supports it."
          visual={<><span id="map" className="sr-only" />{evidence}</>}
          points={[
            { title: "Read the passage", text: "Select a step and open Evidence to read the transcript passage that supports it." },
            { title: "Standard BPMN", text: "Activities, decisions, roles, and handoffs are drawn in BPMN 2.0." },
            { title: "Private projects", text: "Your transcripts and models are private to your account." },
          ]}
        />

        <MarketingSection
          name="questions"
          id="clarify"
          headline="What the interview missed becomes a question."
          intro="People describe their own work and skip how it reaches the next team. The agent records each gap as a question instead of guessing."
          visual={questions}
          points={[
            { title: "Open until resolved", text: "A question stays open until an answer resolves it." },
            { title: "Why it matters", text: "Each question says what it decides." },
            { title: "Answers become sources", text: "Each answer is saved as a new source." },
          ]}
        />

        <MarketingSection
          name="revisions"
          id="plan"
          headline="Revise the same model, then plan the next one."
          intro="Each round of answers produces a new revision, and Senda keeps them all. When the current process is settled, start a To-be plan from the revision you choose."
          visual={history}
          points={[
            { title: "See what changed", text: "Each revision lists what it added, changed, and removed." },
            { title: "Two separate models", text: "The To-be plan starts as a copy. The As-is model is left as it was." },
            { title: "Download BPMN", text: "Export a .bpmn file with its layout, tested with bpmn-js." },
          ]}
        />

        <section data-section="example-band" className={container}>
          <div className="flex flex-col items-center gap-5 rounded-[1.75rem] bg-muted px-6 py-12 text-center sm:py-16">
            <p className={cn(display, "text-[1.75rem] leading-tight")}>See a finished model before you sign up.</p>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              The Brightline client onboarding example is public. Open it and select any step.
            </p>
            <Buttons main="example" />
          </div>
        </section>

        <MarketingSection
          name="agent"
          id="your-agent"
          headline="Use the built-in agent, or connect your own."
          intro="Either one reads the transcript, drafts the model, and revises it from your answers. Senda keeps every revision in one project."
          visual={chat}
          points={[
            { title: "Connect", text: "Add Senda in ChatGPT (beta) or Claude’s connection settings, then sign in." },
            { title: "Share", text: "Give your agent the transcript and ask it to map the process in Senda." },
            { title: "Review", text: "Answer its questions in the same chat, then open Senda to see the diagram and compare revisions." },
          ]}
        >
          <p className={cn("text-muted-foreground", centered)}>
            Prefer a terminal? Use the{" "}
            <a href={`${repository}#from-the-command-line`} className={textLink}>
              command-line tool
            </a>
            .
          </p>
        </MarketingSection>

        <MarketingSection
          name="pricing"
          id="pricing"
          headline="Start free. Continue with Pro."
          intro="Map one project with the built-in agent before deciding whether to pay."
        >
          <div className="flex flex-col gap-6">
            <PricingPlans />
            <p className={cn("text-muted-foreground", centered)}>
              Daily and shared service limits apply.{" "}
              <a href="/usage" className={textLink}>
                Read the usage policy
              </a>
              .
            </p>
          </div>
        </MarketingSection>

        <section id="questions" data-section="faq" className="scroll-mt-24">
          <div className={cn(container, "flex max-w-[calc(768px+4rem)] flex-col gap-10 py-20 sm:py-28")}>
            <h2 className={cn(h2, centered)}>Questions</h2>
            <Accordion type="single" collapsible className="border-t">
              {faqs.map(({ question, answer }, i) => (
                <AccordionItem key={question} value={String(i)}>
                  <AccordionTrigger className="py-5 text-lg font-normal">{question}</AccordionTrigger>
                  <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">{answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section data-section="closing" className={cn(container, "flex flex-col items-center gap-6 pt-8 pb-28 text-center sm:pb-36")}>
          <h2 className={cn(display, "text-[2.8rem] leading-[1.02] sm:text-[4.2rem]")}>Bring your next interview.</h2>
          <p className="max-w-md text-xl leading-relaxed text-pretty text-muted-foreground">
            Map how the process runs today, then plan the one you want.
          </p>
          <Buttons />
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
