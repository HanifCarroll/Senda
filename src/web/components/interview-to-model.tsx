import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Hero illustration: the Finance passage of the public onboarding example above a
// simplified drawing of the Finance subprocess it produced (revision 5). Step names
// and quotes match public/examples/onboarding-final.json.

type Step = 1 | 2 | 3;
type Point = [number, number];
// "h" is the wide drawing. "m" is the compact one below xl, drawn at one unit per pixel so its
// 14 px labels stay 14 px and the whole card fits a 640 px phone screen. Its start event sits
// beside the first gateway to save a row. scripts/test-cloudflare-browser.js checks the spacing.
type Layout = "h" | "m";

const steps: Step[] = [1, 2, 3];

const nodes: {
  kind: "start" | "end" | "gateway" | "task";
  step?: Step;
  icon?: "send" | "receive";
  lines?: string[];
  h: Point;
  m: Point;
}[] = [
  { kind: "start", h: [22, 120], m: [14, 24] },
  { kind: "gateway", h: [78, 120], m: [80, 24] },
  { kind: "task", step: 1, icon: "send", lines: ["Issue deposit", "invoice"], h: [320, 120], m: [80, 109.5] },
  { kind: "task", step: 2, icon: "receive", lines: ["Receive", "deposit"], h: [476, 120], m: [80, 176.5] },
  { kind: "gateway", h: [580, 120], m: [80, 236] },
  { kind: "task", step: 3, lines: ["Record financial", "clearance"], h: [692, 120], m: [80, 295.5] },
  { kind: "end", h: [800, 120], m: [80, 350] },
];

// The compact task is as wide as a 320 px phone allows, so "Record financial" stays clear of its step badge.
// The wide task leaves "Record financial" ten units from each border in CI's wider Linux font.
const task = { h: [140, 88], m: [216, 55] } as const;

const edges: { h: Point[]; m: Point[]; step?: Step }[] = [
  { h: [[35, 120], [58, 120]], m: [[27, 24], [60, 24]] },
  // The wide arrow into step 1 is long enough to carry "No approved terms" in CI's wider Linux font.
  { h: [[98, 120], [250, 120]], m: [[80, 44], [80, 82]] },
  { h: [[390, 120], [406, 120]], m: [[80, 137], [80, 149]] },
  { h: [[546, 120], [560, 120]], m: [[80, 204], [80, 216]] },
  { h: [[600, 120], [622, 120]], m: [[80, 256], [80, 268]] },
  { h: [[762, 120], [787, 120]], m: [[80, 323], [80, 337]] },
  { h: [[78, 100], [78, 46], [580, 46], [580, 100]], m: [[100, 24], [206, 24], [206, 236], [100, 236]] },
];

// The compact labels sit clear of every connector and gateway in wider fonts than the system one, because CI runs on Linux.
const labels: { text: string; step?: Step; h: Point; m: Point; mAnchor?: "end"; hLines?: string[]; mLines?: string[] }[] = [
  { text: "No approved terms", h: [174, 106], m: [94, 54], mLines: ["No approved", "terms"] },
  { text: "Approved credit terms", h: [329, 30], m: [200, -6], mAnchor: "end", mLines: ["Approved", "credit terms"] },
  { text: "Finance cleared", h: [800, 188], m: [104, 343], hLines: ["Finance", "cleared"], mLines: ["Finance", "cleared"] },
];

function useActiveStep() {
  const [active, setActive] = useState<Step | null>(1);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setActive((s) => steps[(steps.indexOf(s ?? 1) + 1) % steps.length]),
      2600,
    );
    return () => window.clearInterval(timer);
  }, [touched]);
  const bind = (step: Step) => ({
    onMouseEnter: () => (setTouched(true), setActive(step)),
    onFocus: () => (setTouched(true), setActive(step)),
  });
  return { active, bind };
}

function Badge({ step, active }: { step: Step; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mr-1 inline-flex size-[1.3rem] -translate-y-px items-center justify-center rounded-full align-middle text-sm font-semibold tabular-nums transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-[var(--brand-teal)]/15 text-primary",
      )}
    >
      {step}
    </span>
  );
}

function Highlight({
  step,
  active,
  bind,
  children,
}: {
  step: Step;
  active: boolean;
  bind: ReturnType<typeof useActiveStep>["bind"];
  children: ReactNode;
}) {
  return (
    <mark
      tabIndex={0}
      {...bind(step)}
      className={cn(
        "cursor-default rounded-[0.3rem] px-0.5 py-0.5 text-foreground transition-colors outline-none box-decoration-clone focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-[var(--brand-tint)] ring-1 ring-[var(--brand-teal)]/50" : "bg-[var(--brand-tint)]/45",
      )}
    >
      <Badge step={step} active={active} />
      {children}
    </mark>
  );
}

function Diagram({ layout, active }: { layout: Layout; active: Step | null }) {
  const [width, height] = task[layout];
  const wide = layout === "h";
  const arrow = `itm-arrow-${layout}`;
  const on = (step?: Step) => step !== undefined && step === active;
  return (
    <svg
      viewBox={wide ? "0 0 848 232" : "-30 -30 240 405"}
      className={cn("h-auto w-full", wide ? "hidden xl:block" : "mx-auto max-w-[240px] xl:hidden")}
      role="img"
      aria-label="Finance subprocess: check credit terms; without approved terms, issue the deposit invoice and receive the deposit; then record financial clearance."
      fontFamily="ui-sans-serif, system-ui, sans-serif"
    >
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--brand-text)" />
        </marker>
      </defs>
      {edges.map((edge, i) => (
        <polyline
          key={i}
          points={edge[layout].map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke={on(edge.step) ? "var(--brand-ink)" : "var(--brand-text)"}
          strokeWidth={on(edge.step) ? 2.5 : 1.3}
          markerEnd={`url(#${arrow})`}
          className="transition-[stroke,stroke-width]"
        />
      ))}
      {labels.map(({ text, step, mAnchor, hLines, mLines, ...at }) => (
        <text
          key={text}
          x={at[layout][0]}
          y={at[layout][1]}
          textAnchor={wide ? "middle" : mAnchor ?? "start"}
          fontSize="14"
          fontWeight={on(step) ? 600 : 400}
          fill={on(step) ? "var(--brand-ink)" : "var(--brand-muted)"}
        >
          {(wide ? hLines : mLines)?.map((line, index) => (
            <tspan key={line} x={at[layout][0]} y={at[layout][1] + index * (wide ? 18 : 17)}>{line}</tspan>
          )) ?? text}
        </text>
      ))}
      {nodes.map((node, i) => {
        const [x, y] = node[layout];
        const lit = on(node.step);
        if (node.kind === "start" || node.kind === "end")
          return (
            <circle key={i} cx={x} cy={y} r="13" fill="white" stroke="var(--brand-text)" strokeWidth={node.kind === "end" ? 3.5 : 1.5} />
          );
        if (node.kind === "gateway")
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M0 -20L20 0L0 20L-20 0z" fill="white" stroke="var(--brand-text)" strokeWidth="1.5" />
              <path d="M-6 -6L6 6M6 -6L-6 6" stroke="var(--brand-text)" strokeWidth="2.2" strokeLinecap="round" />
            </g>
          );
        return (
          <g key={i} transform={`translate(${x - width / 2} ${y - height / 2})`}>
            <rect
              width={width}
              height={height}
              rx="8"
              fill={lit ? "var(--brand-tint)" : "white"}
              stroke={lit ? "var(--brand-ink)" : "var(--brand-text)"}
              strokeWidth={lit ? 2.5 : 1.3}
              className="transition-[fill,stroke,stroke-width]"
            />
            {node.icon && (
              <g transform="translate(7 7) scale(0.85)" stroke="var(--brand-text)" strokeWidth="1">
                <rect width="14" height="10" rx="1" fill={node.icon === "send" ? "var(--brand-text)" : "white"} />
                <path d="M0 0L7 5.5L14 0" fill="none" stroke={node.icon === "send" ? "white" : "var(--brand-text)"} />
              </g>
            )}
            <g transform={`translate(${width - 16} 16)`}>
              <circle r="9" fill={lit ? "var(--brand-ink)" : "var(--brand-tint)"} className="transition-[fill]" />
              <text y="5" textAnchor="middle" fontSize="14" fontWeight="600" fill={lit ? "white" : "var(--brand-ink)"}>
                {node.step}
              </text>
            </g>
            {node.lines!.map((line, n) => (
              <text
                key={line}
                x={width / 2}
                y={height / 2 + (n - (node.lines!.length - 1) / 2) * 16 + (wide ? 12 : 5)}
                textAnchor="middle"
                fontSize="14"
                fontWeight={lit ? 600 : 500}
                fill="var(--brand-text)"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function InterviewToModel() {
  const { active, bind } = useActiveStep();
  const props = (step: Step) => ({ step, active: active === step, bind });
  return (
    <div className="overflow-hidden rounded-2xl bg-card text-left shadow-[0_2px_4px_rgb(9_30_38/12%),0_32px_80px_-24px_rgb(9_30_38/55%)]">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-border" />
          ))}
        </span>
        <span className="mr-auto text-sm text-muted-foreground">Example: Brightline client onboarding</span>
        <a
          href="/example?view=FinanceWork&element=Invoice"
          className="hidden items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          Open the example
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <div className="bg-muted px-3 py-2 sm:px-10 sm:py-9">
        {/* 14 px on the narrowest phones, so the card fits one 640 px screen. */}
        <p className="mx-auto max-w-3xl leading-[1.8] max-[359px]:text-sm max-[359px]:leading-[1.65] sm:text-lg sm:leading-[1.9]">
          <span className="mr-1.5 font-semibold">Luis, Finance:</span>A new client normally needs a
          deposit. <Highlight {...props(1)}>I issue the deposit invoice</Highlight> to the billing
          contact, <Highlight {...props(2)}>wait until we can identify the received payment</Highlight>,
          and <Highlight {...props(3)}>record financial clearance</Highlight>.
        </p>
      </div>
      <div className="px-3 py-1 sm:px-10 sm:py-10">
        <div className="mx-auto max-w-[848px]">
          <Diagram layout="h" active={active} />
          <Diagram layout="m" active={active} />
        </div>
      </div>
    </div>
  );
}
