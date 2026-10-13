import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { openDatabase } from "./db.mjs";
import { createApp } from "./app.mjs";
const production = process.env.NODE_ENV === "production";
const dbPath = path.resolve(
  process.env.DATABASE_PATH || ".data/studyroom.sqlite",
);
fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
let secret = process.env.SESSION_SECRET;
if (production && (!secret || secret.length < 32))
  throw new Error("Set SESSION_SECRET to at least 32 random characters.");
if (!secret) {
  const key = path.join(path.dirname(dbPath), "session.key");
  if (!fs.existsSync(key))
    fs.writeFileSync(key, randomBytes(48).toString("hex"), { mode: 0o600 });
  secret = fs.readFileSync(key, "utf8");
}
const origin = process.env.APP_ORIGIN || "http://localhost:5173";
if (production && !origin.startsWith("https://"))
  throw new Error("Production requires an HTTPS APP_ORIGIN.");
const db = openDatabase(dbPath);
const app = createApp({
  db,
  config: {
    production,
    origin,
    sessionSecret: secret,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`,
    adminEmails: process.env.ADMIN_EMAILS,
    trustProxy: process.env.TRUST_PROXY === "1",
  },
});
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(
    `Studyroom API listening on port ${process.env.PORT || 3001}; Google sign-in ${process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? "configured" : "not configured"}`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
