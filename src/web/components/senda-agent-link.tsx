import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
export function SendaAgentLink({ projectId }: { projectId?: string }) {
  const [access, setAccess] = useState<{available:boolean;trial?:{projectId:string|null;chatId:string|null}}|null>(null);
  useEffect(() => {
    void api<NonNullable<typeof access>>(`/api/agent/config${projectId?`?project=${encodeURIComponent(projectId)}`:""}`)
      .then(setAccess)
      .catch(() => {});
  }, [projectId]);
  const trial=access?.trial,canResume=!!trial?.chatId&&(!projectId||trial.projectId===projectId);
  const label=trial?(trial.chatId?'Continue Luna trial':'Try Luna free'):'Talk to Senda';
  const href=canResume?`/app/agent?chat=${trial!.chatId}`:`/app/agent${projectId?`?project=${projectId}`:""}`;
  return access?.available||canResume ? (
    <Button variant="outline" className={projectId ? "size-9 p-0 sm:w-auto sm:px-3" : undefined} asChild>
      <a aria-label={label} href={href}>
        <MessageSquare />
        <span className={projectId ? "hidden sm:inline" : undefined}>{label}</span>
      </a>
    </Button>
  ) : null;
}
