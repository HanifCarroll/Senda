const files = import.meta.glob(
  "../../skills/senda/{SKILL.md,references/*.md}",
  { query: "?raw", import: "default", eager: true },
);
export async function skillBundle() {
  return Object.fromEntries(
    Object.entries(files).map(([name, text]) => [
      name.replace("../../skills/senda/", ""),
      text,
    ]),
  );
}
