import { ArrowRight, Check } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free", price: "$0", detail: "No payment card needed",
    intro: "Try the built-in agent before deciding whether to pay.",
    features: ["Try the built-in agent on one project with a $0.50 lifetime allowance", "Create up to 3 saved cloud projects", "Keep using your own Claude or ChatGPT (beta)", "Separate As-is and To-be models", "Source evidence and revision history", "Download standard BPMN diagrams"],
    href: "/app", action: "Start free",
  },
  {
    name: "Pro", price: "$29", detail: "USD per month · cancel any time",
    intro: "Work directly with the Senda agent.",
    features: ["Create up to 100 saved cloud projects", "Everything in Free", "Built-in chat with the Senda agent", "$6 monthly AI allowance, with usage shown", "No automatic overage charges"],
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
          <p className="text-sm text-muted-foreground">{plan.detail}</p>
        </div>
        <p className="leading-relaxed">{plan.intro}</p>
        <ul className="flex flex-1 flex-col gap-4">{plan.features.map(feature => <li key={feature} className="flex gap-3 text-sm leading-6"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
        <Button size="lg" variant={plan.name === "Pro" ? "default" : "outline"} asChild><a href={plan.href}>{plan.action}<ArrowRight /></a></Button>
      </section>)}
    </div>
    <p className="text-sm text-muted-foreground">Sold by HC Studio LLC. <a href="/usage" className="underline underline-offset-4">Usage and subscription terms</a></p>
  </>;
}
