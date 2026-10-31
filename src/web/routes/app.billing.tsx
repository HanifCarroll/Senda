import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMachine } from "@xstate/react";
import { createBillingMachine } from "@/lib/account-machines.js";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AccountFrame } from "@/components/account-frame";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { api, post } from "@/lib/api";

export const Route = createFileRoute("/app/billing")({
  validateSearch: (s: Record<string, unknown>) => ({ checkout: s.checkout === "complete" ? "complete" : undefined }),
  component: Billing,
});
type Plan = {
  available: boolean; checkoutAvailable?: boolean; sandbox?: boolean;
  priceUsd: number; includedUsd: number; usedUsd: number; pendingUsd?: number; managed: boolean;
  projectLimit: number;
  pause?: { reason: string; message: string; resetAt?: string } | null;
  subscription?: { status: string; active: boolean; periodEnd: string; cancelAt?: number | null };
};
function Billing() {
  const search = Route.useSearch();
  const [machine] = useState(() => createBillingMachine({
    load: (signal: AbortSignal) => api<Plan>("/api/billing", { signal }),
    open: (action: "checkout" | "portal" | "payment-method") => post(`/api/billing/${action}`, {}),
    navigate: (url: string) => window.location.assign(url),
  }));
  const [state, send] = useMachine(machine);
  const plan = state.context.plan as Plan | null;
  const error = state.context.error as string;
  const opening = state.hasTag("opening") ? state.context.action : null;
  const busy = state.hasTag("opening");
  useEffect(() => {
    send({ type: "START", checkout: !!search.checkout });
  }, [search.checkout, send]);
  const usage = plan ? Math.min(100, Math.max(0, Math.round(plan.usedUsd / plan.includedUsd * 100))) : 0;
  return <AccountFrame>
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Button variant="ghost" className="self-start" asChild><a href="/app"><ArrowLeft />Your processes</a></Button>
      <div><h1 className="text-3xl font-semibold tracking-tight">Your plan</h1><p className="mt-3 text-muted-foreground">Your projects, subscription and built-in AI allowance.</p></div>
      {error && <Alert variant="destructive"><AlertTitle>Billing needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!plan && !error && <p role="status">Opening your plan…</p>}
      {plan?.available === false && <p className="leading-7 text-muted-foreground">Paid plans aren’t available yet. You can keep using Senda with ChatGPT or Claude.</p>}
      {plan?.available && <>
        {plan.sandbox && <Alert><AlertTitle>Payment test environment</AlertTitle><AlertDescription>Use test payment details here. No real payment will be taken.</AlertDescription></Alert>}
        <section className="flex flex-col gap-5 border-y py-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-semibold">Senda Pro</h2><p><strong className="text-2xl">${plan.priceUsd}</strong><span className="text-muted-foreground"> USD / month</span></p></div>
          <p className="leading-7 text-muted-foreground">Keep up to 100 saved projects at a time and map your processes in the built-in chat. Pro includes a ${plan.includedUsd} monthly AI allowance measured using a fixed rate card. Work pauses at a limit, with no automatic overage charges.</p>
          {plan.pause && <Alert><AlertTitle>Built-in agent paused</AlertTitle><AlertDescription>{plan.pause.message}</AlertDescription></Alert>}
          {plan.subscription?.active ? <>
            <div className="flex justify-between gap-4 text-sm"><span>AI allowance used</span><span>{usage}%</span></div>
            <progress className="h-2 w-full accent-primary" max={100} value={usage} aria-label="AI allowance used" />
            {!!plan.pendingUsd && <p className="text-sm text-muted-foreground">A reply is being prepared. Its temporary allowance reservation is not shown as used.</p>}
            <p className="text-sm text-muted-foreground">{plan.subscription.cancelAt ? "Access ends" : "Allowance renews"} {new Date(plan.subscription.periodEnd).toLocaleDateString(undefined, { dateStyle: "long" })}.</p>
          </> : <p className="text-sm text-muted-foreground">{plan.subscription ? `Subscription status: ${plan.subscription.status.replaceAll("_", " ")}.` : "You’re on Free. Try the built-in agent on one project with a $0.50 lifetime allowance, and keep up to 3 saved projects at a time with your connected agent."}</p>}
          {plan.subscription && ["past_due", "unpaid", "incomplete"].includes(plan.subscription.status) && <p className="text-sm leading-6 text-muted-foreground">Your latest payment hasn’t completed. Use Update payment method to save a new card, then open Manage subscription to pay the failed amount. Saving a card alone does not settle an outstanding invoice. Built-in chat resumes after Stripe confirms payment.</p>}
          {search.checkout && !plan.subscription?.active && <p role="status" className="text-sm">Your plan appears here after Stripe confirms payment. You can return to your processes while it updates.</p>}
          <div className="flex flex-wrap gap-3">
            {plan.managed && <>
              <Button variant="outline" disabled={busy} onClick={() => send({ type: "OPEN", action: "payment-method" })}>{opening === 'payment-method' ? 'Opening Stripe…' : 'Update payment method'}<ExternalLink /></Button>
              <Button variant="outline" disabled={busy} onClick={() => send({ type: "OPEN", action: "portal" })}>{opening === 'portal' ? 'Opening Stripe…' : 'Manage subscription'}<ExternalLink /></Button>
            </>}
            {!plan.subscription?.active && plan.checkoutAvailable && <Button disabled={busy} onClick={() => send({ type: "OPEN", action: "checkout" })}>{opening === 'checkout' ? "Opening Stripe…" : "Choose Pro"}</Button>}
          </div>
        </section>
        <p className="text-sm leading-6 text-muted-foreground">Your saved diagrams stay readable, editable with your connected agent, and exportable when a paid plan ends. You can keep up to {plan.projectLimit} projects at a time. Deleting a project frees a slot; you have seven days to restore it if there is room. Deletion does not reset your trial or monthly AI usage.</p>
        <p className="text-sm leading-6 text-muted-foreground">Cancel at the end of your paid period through Manage subscription. Daily and shared service limits apply. <a className="underline underline-offset-4" href="/usage">Usage and subscription terms</a> · <a className="underline underline-offset-4" href="mailto:hanifcarroll@gmail.com">Billing support and refunds</a></p>
      </>}
    </main>
  </AccountFrame>;
}
