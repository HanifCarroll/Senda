import { ArrowRight, Check } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type Plan = { name: string; price: string; detail: string; features: string[]; href: string; action: string };

// Keep these terms in step with docs/billing.md and the home page FAQ.
const plans: Plan[] = [
  {
    name: "Free", price: "$0", detail: "No payment card needed",
    features: ["Try the built-in agent on one project, with $0.50 of AI usage included", "Up to 3 saved projects at a time", "Connect your own Claude or ChatGPT (beta)", "As-is and To-be diagrams, evidence, revision history, and BPMN downloads"],
    href: "/app", action: "Start free",
  },
  {
    name: "Pro", price: "$29", detail: "USD per month · cancel any time",
    features: ["Everything in Free", "Built-in agent on every project", "Up to 100 saved projects at a time", "$6 of built-in agent usage each month, with usage shown", "No automatic overage charges"],
    href: "/app/billing", action: "Choose Pro",
  },
];

export function PricingPlans() {
  return <>
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map(plan => <section key={plan.name} aria-label={`${plan.name} plan`} className={cn("flex flex-col gap-6 rounded-2xl border p-6 sm:p-8", plan.name === "Pro" && "border-primary bg-muted/40")}>
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-semibold">{plan.name}</h3>
          <p className="text-4xl font-semibold tracking-tight">{plan.price}</p>
          <p className="text-muted-foreground">{plan.detail}</p>
        </div>
        <ul className="flex flex-1 flex-col gap-4">{plan.features.map(feature => <li key={feature} className="flex gap-3 leading-6"><Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
        <Button size="lg" variant={plan.name === "Pro" ? "default" : "outline"} className="h-11 text-base" asChild><a href={plan.href}>{plan.action}<ArrowRight /></a></Button>
      </section>)}
    </div>
  </>;
}
