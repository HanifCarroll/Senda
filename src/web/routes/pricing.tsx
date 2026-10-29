import { createFileRoute } from "@tanstack/react-router";
import { Check, ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Plans and pricing · Senda" }] }),
  component: Pricing,
});

function Pricing() {
  return <main className="mx-auto flex max-w-5xl flex-col gap-12 px-5 py-10 sm:px-8 sm:py-14">
    <nav className="flex items-center justify-between gap-4" aria-label="Main navigation">
      <a href="/" aria-label="Senda home"><Brand className="h-8" /></a>
      <a href="/sign-in" className="text-sm underline underline-offset-4">Sign in</a>
    </nav>
    <header className="max-w-2xl space-y-4">
      <h1 className="font-display text-5xl tracking-tight sm:text-6xl">Keep the evidence behind every diagram.</h1>
      <p className="text-lg leading-relaxed text-muted-foreground">Start with your own agent. Choose Pro for more projects and a built-in conversation, from your first transcript through later process changes.</p>
    </header>
    <div className="grid gap-6 md:grid-cols-2">
      {[
        { name: "Free", price: "$0", detail: "No payment card needed", intro: "Use an agent you already have.", features: ["Create up to 3 saved cloud projects", "Connect Claude or ChatGPT (beta)", "Separate As-is and To-be models", "Source evidence and revision history", "Download standard BPMN diagrams"], href: "/app", action: "Start free" },
        { name: "Pro", price: "$29", detail: "USD per month · cancel any time", intro: "Work directly with the Senda agent.", features: ["Create up to 100 saved cloud projects", "Everything in Free", "Built-in chat powered by DeepSeek Flash", "$6 monthly AI allowance, with usage shown", "No automatic overage charges"], href: "/app/billing", action: "Choose Pro" },
      ].map(plan => <section key={plan.name} className={`flex flex-col gap-6 rounded-2xl border p-6 sm:p-8 ${plan.name === "Pro" ? "border-primary bg-muted/40" : ""}`}>
        <div className="space-y-3"><h2 className="text-xl font-semibold">{plan.name}</h2><p className="text-4xl font-semibold tracking-tight">{plan.price}</p><p className="text-sm text-muted-foreground">{plan.detail}</p></div>
        <p className="leading-relaxed">{plan.intro}</p>
        <ul className="flex flex-1 flex-col gap-4">{plan.features.map(feature => <li className="flex gap-3 text-sm leading-6" key={feature}><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
        <Button size="lg" variant={plan.name === "Pro" ? "default" : "outline"} asChild><a href={plan.href}>{plan.action}<ArrowRight /></a></Button>
      </section>)}
    </div>
    <section className="grid gap-8 border-t pt-8 sm:grid-cols-2">
      <div className="space-y-3"><h2 className="text-lg font-semibold">How much built-in AI is included?</h2><p className="leading-7 text-muted-foreground">Pro includes a $6 monthly allowance measured using Senda’s fixed AI rate card. Longer transcripts, larger diagrams and revisions use different amounts. It is an allowance for work, with no promised number of replies or completed processes.</p><a className="underline underline-offset-4" href="/usage">Read the usage policy</a></div>
      <div className="space-y-3"><h2 className="text-lg font-semibold">What happens when I reach a limit?</h2><p className="leading-7 text-muted-foreground">The built-in agent pauses. Your saved work stays readable, editable with your connected agent, and exportable. Daily and shared service limits also apply. Nothing extra is bought or charged automatically.</p></div>
      <div className="space-y-3"><h2 className="text-lg font-semibold">What counts as a project?</h2><p className="leading-7 text-muted-foreground">A saved process project can hold its sources, As-is model and separate To-be models. You can create up to your plan’s total. Projects cannot currently be deleted or archived in the app; contact support for deletion. Existing projects stay available if you later move to Free.</p></div>
      <div className="space-y-3"><h2 className="text-lg font-semibold">Which agent should I use?</h2><p className="leading-7 text-muted-foreground">Use the Senda agent in Pro, or connect your own Claude account on either plan. ChatGPT is in beta: it can save changes but sometimes fails to display its reply. Check the saved diagram in Senda before repeating a request. Your connected agent’s subscription is separate.</p></div>
    </section>
    <footer className="flex flex-wrap gap-5 border-t pt-6 text-sm text-muted-foreground"><a href="/usage" className="underline underline-offset-4">Usage and subscription terms</a><a href="/privacy" className="underline underline-offset-4">Privacy</a><a href="mailto:hanifcarroll@gmail.com" className="underline underline-offset-4">Contact support</a><span>Sold by HC Studio LLC</span></footer>
  </main>;
}
