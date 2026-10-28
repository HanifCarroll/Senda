import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Hero illustration: the Finance passage of the public onboarding example above a
// simplified drawing of the Finance subprocess it produced (revision 5). Step names
// and quotes match public/examples/onboarding-final.json.

type Step = 1 | 2 | 3;
type Point = [number, number];
type Layout = "h" | "v";

const steps: Step[] = [1, 2, 3];

const nodes: {
  kind: "start" | "end" | "gateway" | "task";
  step?: Step;
  icon?: "send" | "receive";
  lines?: string[];
  h: Point;
  v: Point;
}[] = [
  { kind: "start", h: [22, 120], v: [150, 22] },
  { kind: "gateway", h: [78, 120], v: [150, 78] },
  { kind: "task", step: 1, icon: "send", lines: ["Issue deposit", "invoice"], h: [200, 120], v: [150, 150] },
  { kind: "task", step: 2, icon: "receive", lines: ["Receive", "deposit"], h: [348, 120], v: [150, 236] },
  { kind: "gateway", h: [448, 120], v: [150, 306] },
  { kind: "task", step: 3, lines: ["Record financial", "clearance"], h: [556, 120], v: [150, 378] },
  { kind: "end", h: [660, 120], v: [150, 446] },
];

const task = { h: [116, 62], v: [150, 52] } as const;

const edges: { h: Point[]; v: Point[]; step?: Step }[] = [
  { h: [[35, 120], [58, 120]], v: [[150, 35], [150, 58]] },
  { h: [[98, 120], [142, 120]], v: [[150, 98], [150, 124]] },
  { h: [[258, 120], [290, 120]], v: [[150, 176], [150, 210]] },
  { h: [[406, 120], [428, 120]], v: [[150, 262], [150, 286]] },
  { h: [[468, 120], [498, 120]], v: [[150, 326], [150, 352]] },
  { h: [[614, 120], [647, 120]], v: [[150, 404], [150, 433]] },
  { h: [[78, 100], [78, 46], [448, 46], [448, 100]], v: [[170, 78], [268, 78], [268, 306], [170, 306]] },
];

const labels: { text: string; step?: Step; h: Point; v: Point; anchor?: { h?: "start" | "middle" | "end"; v?: "start" | "middle" | "end" } }[] = [
  { text: "No approved terms", h: [78, 158], v: [158, 114], anchor: { v: "start" } },
  { text: "Approved credit terms", h: [263, 38], v: [176, 70], anchor: { v: "start" } },
  { text: "Finance cleared", h: [660, 158], v: [172, 450], anchor: { v: "start" } },
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
        "mr-1 inline-flex size-[1.15rem] -translate-y-px items-center justify-center rounded-full align-middle text-[0.7rem] font-semibold tabular-nums transition-colors",
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
  const arrow = `itm-arrow-${layout}`;
  const on = (step?: Step) => step !== undefined && step === active;
  return (
    <svg
      viewBox={layout === "h" ? "0 0 704 172" : "0 0 300 470"}
      className={cn("h-auto w-full", layout === "h" ? "hidden md:block" : "mx-auto max-w-[300px] md:hidden")}
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
      {labels.map(({ text, step, anchor, ...at }) => (
        <text
          key={text}
          x={at[layout][0]}
          y={at[layout][1]}
          textAnchor={anchor?.[layout] ?? "middle"}
          fontSize="10.5"
          fontWeight={on(step) ? 600 : 400}
          fill={on(step) ? "var(--brand-ink)" : "var(--brand-muted)"}
        >
          {text}
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
            <g transform={`translate(${width - 9} 9)`}>
              <circle r="8" fill={lit ? "var(--brand-ink)" : "var(--brand-tint)"} className="transition-[fill]" />
              <text y="3.5" textAnchor="middle" fontSize="10" fontWeight="600" fill={lit ? "white" : "var(--brand-ink)"}>
                {node.step}
              </text>
            </g>
            {node.lines!.map((line, n) => (
              <text
                key={line}
                x={width / 2}
                y={height / 2 + (n - (node.lines!.length - 1) / 2) * 15 + 7}
                textAnchor="middle"
                fontSize="12.5"
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
        <span className="mr-auto text-[0.8rem] text-muted-foreground">Example: Brightline client onboarding</span>
        <a
          href="/example?view=FinanceWork&element=Invoice"
          className="hidden items-center gap-1 text-[0.8rem] text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          Open the example
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <div className="bg-muted px-5 py-7 sm:px-10 sm:py-9">
        <p className="mx-auto max-w-3xl text-[1.02rem] leading-[1.95] sm:text-lg sm:leading-[1.9]">
          <span className="mr-1.5 font-semibold">Luis, Finance:</span>A new client normally needs a
          deposit. <Highlight {...props(1)}>I issue the deposit invoice</Highlight> to the billing
          contact, <Highlight {...props(2)}>wait until we can identify the received payment</Highlight>,
          and <Highlight {...props(3)}>record financial clearance</Highlight>.
        </p>
      </div>
      <div className="px-5 py-8 sm:px-10 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <Diagram layout="h" active={active} />
          <Diagram layout="v" active={active} />
        </div>
      </div>
    </div>
  );
}
