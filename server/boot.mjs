import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { openDatabase, openPostgres } from "./db.mjs";
import { createApp } from "./app.mjs";

export async function boot() {
  const vercel = process.env.VERCEL === "1";
  const production = process.env.NODE_ENV === "production" || vercel;
  const databaseUrl = process.env.DATABASE_URL;
  if (vercel && !databaseUrl)
    throw new Error(
      "Set DATABASE_URL to the Supabase transaction-pooler connection string. Vercel cannot keep the local SQLite file.",
    );
  const dbPath = path.resolve(
    process.env.DATABASE_PATH || ".data/studyroom.sqlite",
  );
  let secret = process.env.SESSION_SECRET;
  if (production && (!secret || secret.length < 32))
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  if (!secret) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
    const key = path.join(path.dirname(dbPath), "session.key");
    if (!fs.existsSync(key))
      fs.writeFileSync(key, randomBytes(48).toString("hex"), { mode: 0o600 });
    secret = fs.readFileSync(key, "utf8");
  } else if (!databaseUrl) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  }
  const origin = process.env.APP_ORIGIN || "http://localhost:5173";
  if (production && !origin.startsWith("https://"))
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  const db = databaseUrl
    ? await openPostgres(databaseUrl)
    : openDatabase(dbPath);
  const app = createApp({
    db,
    config: {
      production,
      origin,
      sessionSecret: secret,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ||
        `${origin}/api/auth/google/callback`,
      adminEmails: process.env.ADMIN_EMAILS,
      trustProxy: process.env.TRUST_PROXY === "1" || vercel,
    },
  });
  return { app, db, databaseUrl: Boolean(databaseUrl) };
}
