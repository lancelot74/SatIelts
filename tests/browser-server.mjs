import express from "express";
// Test-only OAuth adapter; the production entry point never imports this file.
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
let nonce;
const oauthClient = {
  generateAuthUrl(options) {
    nonce = options.nonce;
    return `http://localhost:4173/__test/google?state=${options.state}`;
  },
  async getToken({ code }) {
    return {
      tokens: {
        id_token: JSON.stringify({
          sub: code,
          email: `${code}@example.com`,
          name: code,
          email_verified: true,
          nonce,
        }),
      },
    };
  },
  async verifyIdToken({ idToken }) {
    return { getPayload: () => JSON.parse(idToken) };
  },
};
const app = createApp({
  db: openDatabase(":memory:"),
  oauthClient,
  config: {
    origin: "http://localhost:4173",
    sessionSecret: "only-for-browser-tests-a-random-long-string",
    googleClientId: "browser-test",
    googleClientSecret: "browser-test",
    redirectUri: "http://localhost:4173/api/auth/google/callback",
    adminEmails: "owner@example.com",
  },
});
const fixture = express();
fixture.get("/__test/google", (req, res) => {
  const state = encodeURIComponent(String(req.query.state || ""));
  res
    .type("html")
    .send(
      '<!doctype html><html lang="en"><title>Test OAuth provider</title><body>' +
        ["student", "owner"]
          .map(
            (name) =>
              `<a href="/api/auth/google/callback?state=${state}&code=${name}">Use test account ${name}</a>`,
          )
          .join("<br>") +
        "</body></html>",
    );
});
fixture.use(app);
fixture.listen(4173, "0.0.0.0");
