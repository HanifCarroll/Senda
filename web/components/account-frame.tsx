import type { ReactNode } from "react";
import { GitBranch, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { ConnectAgent } from "./connect-agent";
import { productName } from "@/lib/brand";
export function AccountFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="account-header border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <a href="/app" className="mr-auto flex items-center gap-2 font-semibold">
            <GitBranch className="size-5" />
            {productName}
          </a>
          <ConnectAgent />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/");
            }}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      {children}
    </>
  );
}
