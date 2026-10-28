import { useState } from "react";
import { Copy, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "./ui/dialog";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

export function AgentRequest({
  title,
  prompt,
}: {
  title: string;
  prompt: string;
}) {
  const [text, setText] = useState(prompt);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Paste this into your process-modeling chat.");
    } catch {
      toast.error(
        "Copy was unavailable. Select the text and copy it manually.",
      );
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquare data-icon="inline-start" />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Add your answer or correction, then copy the request into the chat
            with your modeling agent.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="agent-request">
              Request for the agent
            </FieldLabel>
            <Textarea
              id="agent-request"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={copy}>
            <Copy data-icon="inline-start" />
            Copy request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
