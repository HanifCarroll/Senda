import { ArrowRight, Check } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free", price: "$0", detail: "No payment card needed",
    intro: "Use an agent you already have.",
    features: ["Create up to 3 saved cloud projects", "Connect Claude or ChatGPT (beta)", "Separate As-is and To-be models", "Source evidence and revision history", "Download standard BPMN diagrams"],
    href: "/app", action: "Start free",
  },
  {
    name: "Pro", price: "$29", detail: "USD per month · cancel any time",
    intro: "Work directly with the Senda agent.",
    features: ["Create up to 100 saved cloud projects", "Everything in Free", "Built-in chat powered by GPT-6 Luna", "$6 monthly AI allowance, with usage shown", "No automatic overage charges"],
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
    <div className="grid gap-8 border-t pt-8 sm:grid-cols-2">
      <div className="space-y-3"><h3 className="text-lg font-semibold">How much built-in AI is included?</h3><p className="leading-7 text-muted-foreground">Pro includes a $6 monthly allowance measured using Senda’s fixed AI rate card. Longer transcripts, larger diagrams and revisions use different amounts. There is no promised number of replies or completed processes.</p><a className="underline underline-offset-4" href="/usage">Read the usage policy</a></div>
      <div className="space-y-3"><h3 className="text-lg font-semibold">What happens when I reach a limit?</h3><p className="leading-7 text-muted-foreground">The built-in agent pauses. Your saved work stays readable, editable with your connected agent, and exportable. Daily and shared service limits also apply. Nothing extra is bought or charged automatically.</p></div>
      <div className="space-y-3"><h3 className="text-lg font-semibold">What counts as a project?</h3><p className="leading-7 text-muted-foreground">A project holds its sources, As-is model and separate To-be model. Projects cannot currently be deleted or archived in the app; contact support for deletion. Existing projects stay available if you later move to Free.</p></div>
      <div className="space-y-3"><h3 className="text-lg font-semibold">Which agent should I use?</h3><p className="leading-7 text-muted-foreground">Use the Senda agent in Pro, or connect your own Claude account on either plan. ChatGPT is in beta: it can save changes but sometimes fails to display its reply. Check the saved diagram before repeating a request. Your connected agent’s subscription is separate.</p></div>
    </div>
    <p className="text-sm text-muted-foreground">Sold by HC Studio LLC. <a href="/usage" className="underline underline-offset-4">Usage and subscription terms</a></p>
  </>;
}
