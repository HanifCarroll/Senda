import { readFile, readdir } from "node:fs/promises";
export async function skillBundle() {
  const base = new URL("../skills/process-scribe/", import.meta.url);
  const names = [
    "SKILL.md",
    ...(await readdir(new URL("references/", base)))
      .filter((n) => n.endsWith(".md"))
      .map((n) => `references/${n}`),
  ];
  return Object.fromEntries(
    await Promise.all(
      names.map(async (n) => [n, await readFile(new URL(n, base), "utf8")]),
    ),
  );
}
