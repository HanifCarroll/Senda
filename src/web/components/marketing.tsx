import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { productName } from "@/lib/brand";
import type { Review } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Brand } from "./brand";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { InterviewToModel } from "./interview-to-model";
import { PathArt } from "./path-art";
import { PricingPlans } from "./pricing-plans";

// Bump the version when public/marketing changes (docs/marketing-design.md, "Sharp product previews").
const capture = (file: string) => `/marketing/${file}?v=8`;
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
    text: "Show your client a diagram they can check against what their own people said.",
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
  ["Revision 3", "Finance and Delivery order clarified"],
  ["Revision 4", "Reminder and cancellation paths"],
  ["Revision 5", "Credit-terms rule resolved"],
];

const toBe = [
  ["To-be 1", "Copied from As-is revision 5"],
  ["To-be 2", "Redrawn from the design brief"],
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

type Point = { title: string; text: ReactNode };
// "centered" is one centered column. "wide" puts the headline beside the intro above a full-width visual.
// "visual-right" and "visual-left" put the headline, intro and points beside the visual.
// Every layout is one column below lg.
type Layout = "centered" | "wide" | "visual-right" | "visual-left";

// The one template every section between the hero and the FAQ uses: a headline, an intro, one visual and
// up to three points. docs/marketing-design.md has the layout, word and type rules.
function MarketingSection({
  name, id, headline, intro: introText, visual, points, dark, layout = "centered", children,
}: {
  name: string;
  id?: string;
  headline: string;
  intro?: ReactNode;
  visual?: ReactNode;
  points?: Point[];
  dark?: boolean;
  layout?: Layout;
  children?: ReactNode;
}) {
  const split = layout.startsWith("visual");
  const muted = dark ? "text-primary-foreground/80" : "text-muted-foreground";
  // Below lg every layout is the centered one.
  const left = layout !== "centered" && "lg:text-left";
  return (
    <section id={id} data-section={name} className={cn("scroll-mt-24", dark && "bg-primary text-primary-foreground")}>
      <div
        className={cn(
          container,
          "flex flex-col gap-12 py-20 sm:gap-16 sm:py-28",
          // The visual spans both rows, and the points take the spare height, so they sit under the intro.
          split && "lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-16 lg:gap-y-12",
        )}
      >
        <div
          data-text
          className={cn(
            "mx-auto flex max-w-[720px] flex-col gap-6",
            centered,
            left,
            layout !== "centered" && "lg:mx-0 lg:max-w-none",
            layout === "wide" && "lg:grid lg:grid-cols-2 lg:items-end lg:gap-16",
            layout === "visual-left" && "lg:col-start-2",
          )}
        >
          <h2 className={h2}>{headline}</h2>
          {introText && <p className={cn(intro, muted)}>{introText}</p>}
        </div>
        {visual && (
          <div className={cn(split && "lg:row-span-2 lg:row-start-1 lg:self-center", layout === "visual-right" && "lg:col-start-2")}>
            {visual}
          </div>
        )}
        {(points || (split && children)) && (
          <div className={cn("flex flex-col gap-12 sm:gap-16 lg:gap-8", layout === "visual-left" && "lg:col-start-2")}>
            {points && (
              <ul className={cn("grid gap-8 md:grid-cols-3 md:gap-10", centered, left, split && "lg:grid-cols-1 lg:gap-8")}>
                {points.map(({ title, text }) => (
                  <li key={title} className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className={cn("leading-relaxed", muted)}>{text}</p>
                  </li>
                ))}
              </ul>
            )}
            {split && children}
          </div>
        )}
        {!split && children}
      </div>
    </section>
  );
}

const evidenceExample = "/example?view=Intake&element=CheckPack";

// The evidence section's live example. The static capture holds its place, and the viewer's code and the
// example's data load only when the section comes near the viewport, so the top of the page stays light.
// If either fails to load, the capture stays.
function EvidenceVisual() {
  const frame = useRef<HTMLDivElement>(null);
  const [demo, setDemo] = useState<{ Demo: ComponentType<{ review: Review }>; review: Review }>();
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void Promise.all([import("./evidence-demo"), api<Review>("/examples/onboarding-final.json")])
          .then(([module, review]) => setDemo({ Demo: module.EvidenceDemo, review }))
          .catch(() => {});
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="flex flex-col items-center gap-6">
      <div className={cn(panel, "w-full")}>
        <div
          ref={frame}
          data-visual
          data-capture="evidence"
          className={cn(
            "mx-auto lg:aspect-[1008/620]",
            // The capture is a picture in a window frame. The live example is the app's own two cards.
            !demo && cn(windowFrame, "max-lg:max-w-[390px]"),
          )}
        >
          {demo ? (
            <demo.Demo review={demo.review} />
          ) : (
            <picture>
              <source media="(max-width: 359px)" srcSet={capture("evidence-mobile-small.png")} width="280" height="646" />
              <source media="(max-width: 1023px)" srcSet={capture("evidence-mobile.png")} width="350" height="646" />
              <img
                src={capture("evidence.svg")}
                width="1008"
                height="620"
                loading="lazy"
                alt="The “Check required items” step selected in a client onboarding diagram, next to the interview passage it came from."
                className="w-full"
              />
            </picture>
          )}
        </div>
      </div>
      <a href={evidenceExample} className={textLink}>
        Open the full example
      </a>
    </div>
  );
}

const questions = (
  <div className={cn(panel, "flex flex-col gap-8 sm:gap-10")}>
    <div className="mx-auto flex w-full max-w-[768px] flex-col gap-4 text-lg text-muted-foreground">
      <p>The interview leaves the order of Finance’s and Delivery’s work unclear.</p>
      <blockquote className="border-l-2 border-[var(--brand-teal)] pl-5">
        <p className={cn(display, "text-[1.5rem] leading-snug text-foreground sm:text-[1.75rem]")}>
          “I would want them to confirm whether one is supposed to wait for the other.”
        </p>
      </blockquote>
      <p>So the first draft asked:</p>
    </div>
    <a
      href="/example?draft=true&section=questions"
      data-visual
      data-capture="clarification"
      className={cn(windowFrame, "mx-auto block w-full max-w-[768px] p-2 max-[860px]:max-w-[350px] min-[861px]:max-lg:p-6 lg:max-w-[350px]")}
    >
      <picture>
        <source media="(max-width: 359px)" srcSet={capture("clarification-mobile-small.png")} width="264" height="186" />
        {/* Beside the text the panel is about as wide as a phone, so desktop shows the phone capture too. */}
        <source media="(max-width: 860px), (min-width: 1024px)" srcSet={capture("clarification-mobile.png")} width="334" height="146" />
        <img
          src={capture("clarification.svg")}
          width="720"
          height="106"
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
      <div className="grid gap-8 p-6 sm:grid-cols-2 sm:p-10 lg:grid-cols-1 lg:p-8">
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
            I saved a first draft with each step linked to its passage. Seven questions are open. One question is about
            when the teams can start work:
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
      answer: "A BPMN 2.0 diagram. BPMN is the standard notation for activities, decisions, responsibilities, and handoffs. You can explore it in Senda or download a .bpmn file with its layout. Exports are tested with bpmn-js, the open-source modeler behind bpmn.io. Check the download in the editor you use, because editors can show labels and subprocesses differently.",
    },
    {
      question: "What can I add?",
      answer: "Paste a transcript or interview notes, or upload a TXT, Markdown, VTT, SRT, or DOCX file.",
    },
    {
      question: "Which agent should I use?",
      answer: "Start with Senda’s built-in agent, which you can try free on one project and use on every project with Senda Pro. You can also connect your own Claude, ChatGPT (beta), or another agent that supports custom connectors, on either plan: add Senda in its connection settings, sign in, and ask it to map the interview. ChatGPT can save diagrams to Senda only on its Business, Enterprise, and Edu plans. On ChatGPT’s own Pro plan, ChatGPT can only read your diagrams. Your own agent’s subscription is separate. Coding agents can use the command-line tool with the downloadable skill.",
    },
    {
      question: "Is it free?",
      answer: <>Free includes a one-project trial of the built-in agent with a $0.50 lifetime allowance. You can keep up to three saved projects with your own agent. Senda Pro is $29 USD per month for up to 100 projects and a $6 monthly built-in AI allowance. Daily and shared service limits apply, with no automatic overage charges. <a href="#pricing" className={textLink}>Compare plans</a>. Senda’s code is MIT-licensed.</>,
    },
    {
      question: "How much built-in AI is included?",
      answer: <>Free includes a $0.50 lifetime allowance on one project; Senda Pro includes $6 per month across your projects. Usage follows Senda’s fixed rate card and varies with the work. At a limit, the built-in agent pauses. Your saved work stays readable, exportable, and editable with your connected agent. Daily and shared service limits also apply. Nothing extra is bought or charged automatically. <a href="/usage" className={textLink}>Read the usage policy</a>.</>,
    },
    {
      question: "Who can see my transcripts?",
      answer: <>Projects are private to your account. The built-in agent sends relevant messages, sources, and models to its AI provider, named in the <a href="/privacy" className={textLink}>privacy notice</a>. With a connected agent, that agent and its provider do the drafting. It can read only the projects you share with it, and you can disconnect it at any time.</>,
    },
    {
      question: "What counts as a project?",
      answer: "A project is one process: its interview transcripts and answers, its diagram of how the work runs today, and any To-be plan. Free lets you keep up to three projects at a time. Delete one from its project menu to free a slot. You can restore it within seven days if you have room; after that, its content is permanently erased. Deleting a project does not reset your free trial or Senda Pro allowance.",
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
            Add an interview transcript, and an AI agent drafts the process diagram. Every step links to the passage it
            came from, so you can check it.
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
          intro="A chat assistant can draw a process from a transcript, but it’s hard to tell which steps came from the interview and which it filled in. In Senda, every step links to its passage, open questions stay visible, and each correction is saved as a new revision."
        />

        <MarketingSection
          name="evidence"
          id="how-it-works"
          headline="Every step links to what was said."
          intro="Select any step in the diagram to read the part of the interview it came from."
          layout="wide"
          visual={<><span id="map" className="sr-only" />
            <EvidenceVisual /></>}
          points={[
            { title: "Read the passage", text: "Select a step and open Evidence to read the transcript passage that supports it." },
            { title: "Standard BPMN", text: "Diagrams use BPMN 2.0, the standard notation for process maps, and download as a .bpmn file." },
            { title: "Private projects", text: "Only your account can open your transcripts and diagrams." },
          ]}
        />

        <MarketingSection
          name="questions"
          id="clarify"
          headline="The agent asks instead of guessing."
          intro="People describe their own part of the work and often leave out what happens between teams. If the interview doesn’t answer something, the agent writes a question for you to take back to the team."
          layout="visual-right"
          visual={questions}
          points={[
            { title: "Why it’s asking", text: "Each question says what the answer will change in the diagram." },
            { title: "Bring back the answer", text: "Give the agent the team’s answer, in Senda or in your chat. Senda saves it next to the transcript." },
            { title: "Open until the diagram changes", text: "A question closes once the agent updates the diagram from your answer." },
          ]}
        />

        <MarketingSection
          name="revisions"
          id="plan"
          headline="Keep every version, then plan the future process."
          intro="Each time you bring back answers, the agent updates the same diagram and saves a new revision. Once everyone agrees on how the work runs today, start a separate To-be plan for how it should run."
          layout="visual-left"
          visual={history}
          points={[
            { title: "See what changed", text: "Each revision lists what it added, changed, and removed." },
            { title: "Plan from a copy", text: "The To-be plan starts as a copy of the revision you pick. Describe what should change, and the agent redraws it." },
            { title: "Today’s process is untouched", text: "Planning never changes your As-is diagram." },
          ]}
        />

        <section data-section="example-band" className={container}>
          <div className="flex flex-col items-center gap-5 rounded-[1.75rem] bg-muted px-6 py-12 text-center sm:py-16">
            <p className={cn(display, "text-[1.75rem] leading-tight")}>See a worked example before you sign up.</p>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Open the public onboarding example and select any step to read its passage.
            </p>
            <Buttons main="example" />
          </div>
        </section>

        <MarketingSection
          name="agent"
          id="your-agent"
          headline="Use Senda’s built-in agent, or your own Claude or ChatGPT."
          intro="The built-in agent is a chat inside Senda, with nothing to set up."
          layout="visual-right"
          visual={chat}
          points={[
            { title: "Inside Senda", text: "Add your transcript to a project and chat with the built-in agent." },
            {
              title: "In Claude or ChatGPT",
              text: <>Add Senda in its connection settings and sign in. <strong className="font-medium text-foreground">Connect your agent</strong> in Senda has the steps.</>,
            },
            { title: "Keep talking", text: "Answer its questions in the same chat, then open Senda to see the diagram and compare revisions." },
          ]}
        >
          <p className={cn("text-muted-foreground", centered, "lg:text-left")}>
            ChatGPT support is in beta, and ChatGPT can save diagrams only on its Business, Enterprise, and Edu plans.
            There’s also a{" "}
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
          intro="Try the built-in agent on one project for free, or connect your own agent on either plan."
          layout="wide"
        >
          <div className="flex flex-col gap-6">
            <PricingPlans />
            <p className={cn("text-muted-foreground", centered, "lg:text-left")}>
              When the included usage runs out, the built-in agent pauses and nothing extra is charged. Daily and shared
              service limits apply.{" "}
              <a href="/usage" className={textLink}>
                Read the usage policy
              </a>
              .
            </p>
          </div>
        </MarketingSection>

        <section id="questions" data-section="faq" className="scroll-mt-24">
          <div className={cn(container, "flex max-w-[calc(768px+4rem)] flex-col gap-10 py-20 sm:py-28 lg:grid lg:max-w-6xl lg:grid-cols-[1fr_2fr] lg:items-start lg:gap-16")}>
            <h2 className={cn(h2, centered, "lg:text-left")}>Questions</h2>
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
            Map how the process runs today, then plan how it should run.
          </p>
          <Buttons />
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
