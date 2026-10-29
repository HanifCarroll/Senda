import { useEffect, useState, type ReactNode } from "react";
import { CreditCard, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { ConnectAgent } from "./connect-agent";
import { Brand, BrandMark } from "./brand";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
export function AccountFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const [billing, setBilling] = useState(false),
    [ready, setReady] = useState(false),
    [signingOut, setSigningOut] = useState(false),
    [signOutError, setSignOutError] = useState("");
  useEffect(() => {
    setReady(true);
    void api<{ available: boolean }>("/api/billing/config").then(c => setBilling(c.available)).catch(() => {});
  }, []);
  return (
    <>
      <header className="account-header border-b bg-background">
        <div className={cn("mx-auto flex flex-wrap items-center gap-1 px-3 py-3 sm:gap-3 sm:px-6", wide ? "max-w-[1800px]" : "max-w-6xl")}>
          <a href="/app" aria-label="Senda" className="mr-auto flex items-center gap-2 font-semibold">
            <Brand className="hidden sm:block" />
            <BrandMark className="sm:hidden" />
          </a>
          {billing && <Button variant="ghost" size="icon" className="sm:w-auto sm:gap-2 sm:px-3" asChild><a href="/app/billing" aria-label="Billing"><CreditCard /><span className="hidden sm:inline">Billing</span></a></Button>}
          <ConnectAgent />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            disabled={!ready || signingOut}
            onClick={async () => {
              setSigningOut(true);
              setSignOutError("");
              try {
                const result = await authClient.signOut();
                if (result.error) throw new Error();
                window.location.assign("/");
              } catch {
                setSignOutError("Sign-out did not finish. Please try again.");
                setSigningOut(false);
              }
            }}
          >
            <LogOut />
          </Button>
          {signOutError && <p role="alert" className="w-full text-sm">{signOutError}</p>}
        </div>
      </header>
      {children}
    </>
  );
}
