import { authOptions } from "./auth-options.js";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";

export async function createAuth({
  origin,
  directory,
  projects,
  secret = process.env.BETTER_AUTH_SECRET,
}) {
  if (!secret && process.env.NODE_ENV === "production")
    throw new Error(
      "Set BETTER_AUTH_SECRET before starting the hosted service.",
    );
  if (!secret) {
    const filename = path.join(directory, "development-auth-secret");
    try {
      secret = await readFile(filename, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      secret = randomBytes(48).toString("base64url");
      await writeFile(filename, secret, { mode: 0o600, flag: "wx" });
    }
  }
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  const database = new DatabaseSync(path.join(directory, "accounts.sqlite"));
  database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  const options = authOptions({
    origin,
    database,
    secret,
    projects,
    appName: process.env.PRODUCT_NAME || "Senda",
    cimdTransport: fetchClientMetadataResource,
  });
  database.exec(
    "CREATE TABLE IF NOT EXISTS scribe_auth_migrations (version TEXT PRIMARY KEY)",
  );
  // Increment this key when auth configuration introduces new schema fields.
  const migration = "better-auth-1.7.14-scribe-1";
  if (
    !database
      .prepare("SELECT 1 FROM scribe_auth_migrations WHERE version=?")
      .get(migration)
  ) {
    await (await getMigrations(options)).runMigrations();
    database
      .prepare("INSERT INTO scribe_auth_migrations VALUES (?)")
      .run(migration);
  }
  const auth = betterAuth(options);
  return { auth, close: () => database.close() };
}
