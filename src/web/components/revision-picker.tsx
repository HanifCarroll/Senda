import { History } from "lucide-react";
import type { ReviewChoice } from "@/lib/types";
import { processGroups, versionDate } from "@/lib/review-navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
} from "./ui/select";

export function RevisionPicker({
  reviews,
  selectedId,
  onChange,
}: {
  reviews: ReviewChoice[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const groups = processGroups(reviews);
  const selected = reviews.find((r) => r.id === selectedId);
  const active =
    groups.find((g) => g.key === selected?.processKey) || groups[0];
  const version =
    active?.versions.find(
      (v) =>
        v.revision === selected?.revision &&
        v.contentKey === selected?.contentKey,
    ) || active?.versions[0];
  return (
    <div className="revision-picker flex min-w-0 flex-wrap items-center gap-2">
      <History className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      {groups.length > 1 && (
        <Select
          value={active?.key}
          onValueChange={(key) => {
            const latest = groups.find((g) => g.key === key)?.versions[0];
            if (latest) onChange(latest.id);
          }}
        >
          <SelectTrigger
            aria-label="Process"
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectLabel>Processes</SelectLabel>
              {groups.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
      <Select value={version?.id} onValueChange={onChange}>
        <SelectTrigger aria-label="Revision" className="w-auto shrink-0">
          <SelectValue>
            {selected ? `Revision ${selected.revision}` : "Revision"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectGroup>
            <SelectLabel>Latest version first</SelectLabel>
            {active?.versions.map((v, i) => (
              <SelectItem
                key={v.id}
                value={v.id}
                textValue={`Revision ${v.revision}`}
              >
                <span className="flex max-w-80 flex-col gap-1">
                  <span>
                    Revision {v.revision}
                    {i === 0 ? " · Latest" : ""} · {versionDate(v)}
                  </span>
                  <span className="whitespace-normal text-xs text-muted-foreground">
                    {v.summary}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
