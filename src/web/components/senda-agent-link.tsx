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
    <Button variant="outline" asChild>
      <a href={`/app/agent${projectId ? `?project=${projectId}` : ""}`}>
        <MessageSquare />
        Talk to Senda
      </a>
    </Button>
  ) : null;
}
