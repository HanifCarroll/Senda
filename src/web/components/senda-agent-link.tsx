import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
export function SendaAgentLink({ projectId }: { projectId?: string }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    void api<{ available: boolean }>("/api/agent/config")
      .then((c) => setAvailable(c.available))
      .catch(() => {});
  }, []);
  return available ? (
    <Button variant="outline" className={projectId ? "size-9 p-0 sm:w-auto sm:px-3" : undefined} asChild>
      <a aria-label="Talk to Senda" href={`/app/agent${projectId ? `?project=${projectId}` : ""}`}>
        <MessageSquare />
        <span className={projectId ? "hidden sm:inline" : undefined}>Talk to Senda</span>
      </a>
    </Button>
  ) : null;
}
