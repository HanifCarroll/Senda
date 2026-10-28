import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Marketing backdrop: winding contour lines after the logo's path, with a light grain.
// Drawn in ink with light-teal lines; no remote images.

function contour(i: number, phase: number) {
  const y = -120 + i * 64;
  const a = 70 + ((i + phase) % 5) * 16;
  const shift = (phase * 90) % 300;
  return `M ${-200 + shift} ${y} C ${120 + shift} ${y - a}, ${330 + shift} ${y + a * 1.5}, ${620 + shift} ${y + a * 0.3} S ${1060 + shift} ${y - a * 1.3}, ${1500 + shift} ${y + a * 0.5}`;
}

export function PathArt({
  phase = 0,
  className,
  children,
}: {
  phase?: number;
  className?: string;
  children?: ReactNode;
}) {
  const grain = `grain${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const path = 6 + (phase % 3);
  return (
    <div className={cn("relative isolate overflow-hidden rounded-[1.75rem]", className)} style={{ background: "var(--brand-ink)" }}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id={grain}>
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        {Array.from({ length: 17 }, (_, i) => (
          <path
            key={i}
            d={contour(i, phase)}
            fill="none"
            stroke={i === path ? "var(--brand-light-ink)" : "var(--brand-light-teal)"}
            strokeOpacity={i === path ? 0.7 : 0.26}
            strokeWidth={i === path ? 9 : 1.6}
            strokeLinecap="round"
          />
        ))}
        <rect width="100%" height="100%" filter={`url(#${grain})`} opacity={0.18} style={{ mixBlendMode: "overlay" }} />
      </svg>
      {children}
    </div>
  );
}
