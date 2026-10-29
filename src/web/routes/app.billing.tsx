import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AccountFrame } from "@/components/account-frame";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { api, post, ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/billing")({
  validateSearch: (s: Record<string, unknown>) => ({ checkout: s.checkout === "complete" ? "complete" : undefined }),
  component: Billing,
});
type Plan = {
  available: boolean; checkoutAvailable?: boolean; sandbox?: boolean;
  priceUsd: number; includedUsd: number; usedUsd: number; pendingUsd?: number; managed: boolean;
  pause?: { reason: string; message: string; resetAt?: string } | null;
  subscription?: { status: string; active: boolean; periodEnd: string; cancelAt?: number | null };
};
function Billing() {
  const search = Route.useSearch();
  const [plan, setPlan] = useState<Plan | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>, attempts = 0;
    async function load() {
      try {
        const next = await api<Plan>("/api/billing");
        if (!active) return;
        setPlan(next);
        if (search.checkout && next.available && !next.subscription?.active && attempts++ < 12)
          timer = setTimeout(load, 5000);
      } catch (e: any) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) window.location.assign("/sign-in");
        else setError(e.message);
      }
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [search.checkout]);
  async function open(action: "checkout" | "portal") {
    setBusy(true); setError("");
    try { const result = await post(`/api/billing/${action}`, {}); window.location.assign(result.url); }
    catch (e: any) { setError(e.message); setBusy(false); }
  }
  const usage = plan ? Math.min(100, Math.max(0, Math.round(plan.usedUsd / plan.includedUsd * 100))) : 0;
  return <AccountFrame>
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Button variant="ghost" className="self-start" asChild><a href="/app"><ArrowLeft />Your processes</a></Button>
      <div><h1 className="text-3xl font-semibold tracking-tight">Your plan</h1><p className="mt-3 text-muted-foreground">Use your own agent, or work with Senda’s built-in agent.</p></div>
      {error && <Alert variant="destructive"><AlertTitle>Billing needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!plan && !error && <p role="status">Opening your plan…</p>}
      {plan?.available === false && <p className="leading-7 text-muted-foreground">Paid plans aren’t available yet. You can keep using Senda with ChatGPT or Claude.</p>}
      {plan?.available && <>
        {plan.sandbox && <Alert><AlertTitle>Payment test environment</AlertTitle><AlertDescription>Use test payment details here. No real payment will be taken.</AlertDescription></Alert>}
        <section className="flex flex-col gap-5 border-y py-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-semibold">Senda agent</h2><p><strong className="text-2xl">${plan.priceUsd}</strong><span className="text-muted-foreground"> / month</span></p></div>
          <p className="leading-7 text-muted-foreground">Map and revise your processes in Senda. Your plan includes a monthly AI allowance. Work pauses at the allowance, with no automatic overage charges.</p>
          {plan.pause && <Alert><AlertTitle>Built-in agent paused</AlertTitle><AlertDescription>{plan.pause.message}</AlertDescription></Alert>}
          {plan.subscription?.active ? <>
            <div className="flex justify-between gap-4 text-sm"><span>AI allowance used</span><span>{usage}%</span></div>
            <progress className="h-2 w-full accent-primary" max={100} value={usage} aria-label="AI allowance used" />
            {!!plan.pendingUsd && <p className="text-sm text-muted-foreground">A reply is being prepared. Its temporary allowance reservation is not shown as used.</p>}
            <p className="text-sm text-muted-foreground">{plan.subscription.cancelAt ? "Access ends" : "Allowance renews"} {new Date(plan.subscription.periodEnd).toLocaleDateString(undefined, { dateStyle: "long" })}.</p>
          </> : <p className="text-sm text-muted-foreground">{plan.subscription ? `Subscription status: ${plan.subscription.status.replaceAll("_", " ")}.` : "You’re using your own agent."}</p>}
          {search.checkout && !plan.subscription?.active && <p role="status" className="text-sm">Your plan appears here after Stripe confirms payment. You can return to your processes while it updates.</p>}
          <div className="flex flex-wrap gap-3">
            {plan.managed && <Button variant="outline" disabled={busy} onClick={() => void open("portal")}>Manage subscription<ExternalLink /></Button>}
            {!plan.subscription?.active && plan.checkoutAvailable && <Button disabled={busy} onClick={() => void open("checkout")}>{busy ? "Opening Stripe…" : "Choose Senda agent"}</Button>}
          </div>
        </section>
        <p className="text-sm leading-6 text-muted-foreground">Your saved diagrams and connected-agent workflow remain available when a paid plan ends.</p>
      </>}
    </main>
  </AccountFrame>;
}
