import { createHash } from "node:crypto";
export const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export const contentHash = (s) =>
  hash({ name: s.name, mode: s.mode, xml: s.xml, discovery: s.discovery });
