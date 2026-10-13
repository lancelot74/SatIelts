import express from "express";
import session from "express-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { OAuth2Client } from "google-auth-library";
import { SqliteSessionStore, prepareRuns } from "./db.mjs";
import { exams, examById } from "./content.mjs";
import {
  getTest,
  publicTest,
  grade,
  isSample,
  practiceModes,
  testSummary,
} from "./tests.mjs";
const random = () => randomBytes(32).toString("base64url");
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createApp({ db, config, oauthClient, now = Date.now }) {
  prepareRuns(db);
  const app = express();
  const oauth =
    oauthClient ??
    new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.redirectUri,
    );
  const authAvailable = Boolean(
    config.googleClientId && config.googleClientSecret,
  );
  const adminEmails = new Set(
    (config.adminEmails ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (config.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          mediaSrc: ["'self'", "blob:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api",
    session({
      name: "studyroom.sid",
      secret: config.sessionSecret,
      store: new SqliteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: Boolean(config.production),
        maxAge: 7 * 86400000,
      },
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    req.user = req.session.userId
      ? db
          .prepare("SELECT id,email,name FROM users WHERE id=?")
          .get(req.session.userId)
      : null;
    req.isAdmin = !!req.user && adminEmails.has(req.user.email.toLowerCase());
    if (!req.session.csrf) req.session.csrf = random();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        (req.get("origin") && req.get("origin") !== config.origin) ||
        !same(req.get("x-csrf-token"), req.session.csrf)
      )
        return res.status(403).json({ error: "csrf" });
    }
    next();
  });
  const login = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "login_required" });
  const admin = (req, res, next) =>
    req.isAdmin
      ? next()
      : res.status(req.user ? 403 : 401).json({ error: "admin_required" });
  const hasAccess = (req, exam) =>
    req.isAdmin ||
    Boolean(
      req.user &&
      db
        .prepare("SELECT 1 FROM grants WHERE user_id=? AND exam=?")
        .get(req.user.id, exam),
    );
  const authorizeTest = (req, res, next) => {
    if (
      !examById(req.params.exam) ||
      !getTest(req.params.exam, req.params.number)
    )
      return res.status(404).json({ error: "not_found" });
    if (
      !isSample(getTest(req.params.exam, req.params.number)) &&
      !hasAccess(req, req.params.exam)
    )
      return res
        .status(req.user ? 403 : 401)
        .json({ error: req.user ? "access_required" : "login_required" });
    next();
  };
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/session", (req, res) =>
    res.json({
      user: req.user ? { ...req.user, isAdmin: req.isAdmin } : null,
      csrf: req.session.csrf,
      authAvailable,
      grants: req.user
        ? db
            .prepare("SELECT exam FROM grants WHERE user_id=?")
            .all(req.user.id)
            .map((x) => x.exam)
        : [],
      requests: req.user
        ? db
            .prepare("SELECT exam,status FROM access_requests WHERE user_id=?")
            .all(req.user.id)
        : [],
    }),
  );
  app.get("/api/catalog", (_req, res) =>
    res.json(
      exams.map(({ guide, ...e }) => ({
        ...e,
        count: 5,
        topics: e.topics.slice(0, 5),
        modes: practiceModes[e.id].map((mode) => ({
          id: mode.id,
          label: mode.label,
          sample: testSummary(getTest(e.id, `${mode.id}-sample`)),
          tests: Array.from({ length: 5 }, (_, i) =>
            testSummary(getTest(e.id, `${mode.id}-${i + 1}`)),
          ),
        })),
        tests: Array.from({ length: 5 }, (_, i) => {
          const t = getTest(e.id, String(i + 1));
          return {
            number: i + 1,
            minutes: t.minutes,
            count: t.questions.length,
            sections: [...new Set(t.questions.map((q) => q.section))],
          };
        }),
      })),
    ),
  );
  app.get(
    "/api/auth/google",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }),
    (req, res) => {
      if (!authAvailable) return res.redirect("/login?error=not_configured");
      const verifier = random();
      const state = random();
      const nonce = random();
      const destination =
        typeof req.query.next === "string" &&
        /^\/(ielts|toefl|sat|account|admin)(\/[^?#]*)?$/.test(req.query.next)
          ? req.query.next
          : "/account";
      req.session.oauth = {
        state,
        nonce,
        verifier,
        created: now(),
        next: destination,
      };
      const url = oauth.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        state,
        nonce,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        prompt: "select_account",
      });
      req.session.save((err) =>
        err ? res.redirect("/login?error=sign_in_failed") : res.redirect(url),
      );
    },
  );
  app.get("/api/auth/google/callback", async (req, res) => {
    const pending = req.session.oauth;
    delete req.session.oauth;
    if (
      !pending ||
      !same(req.query.state, pending.state) ||
      now() - pending.created > 600000 ||
      typeof req.query.code !== "string"
    )
      return res.redirect("/login?error=sign_in_failed");
    try {
      const { tokens } = await oauth.getToken({
        code: req.query.code,
        codeVerifier: pending.verifier,
        redirect_uri: config.redirectUri,
      });
      const ticket = await oauth.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.googleClientId,
      });
      const profile = ticket.getPayload();
      if (
        !profile?.email_verified ||
        !profile.sub ||
        !profile.email ||
        !same(profile.nonce, pending.nonce)
      )
        throw new Error("Invalid identity");
      db.prepare(
        "INSERT INTO users (google_sub,email,name) VALUES (?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name",
      ).run(
        profile.sub,
        profile.email.toLowerCase(),
        String(profile.name || profile.email).slice(0, 120),
      );
      const user = db
        .prepare("SELECT id FROM users WHERE google_sub=?")
        .get(profile.sub);
      req.session.regenerate((err) => {
        if (err) return res.redirect("/login?error=sign_in_failed");
        req.session.userId = user.id;
        req.session.csrf = random();
        req.session.save((error) =>
          error
            ? res.redirect("/login?error=sign_in_failed")
            : res.redirect(pending.next),
        );
      });
    } catch {
      res.redirect("/login?error=sign_in_failed");
    }
  });
  app.post("/api/logout", (req, res) =>
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "server_error" });
      res
        .clearCookie("studyroom.sid", {
          httpOnly: true,
          sameSite: "lax",
          secure: Boolean(config.production),
        })
        .json({ ok: true });
    }),
  );
  app.get("/api/tests/:exam/:number", authorizeTest, (req, res) => {
    const test = getTest(req.params.exam, req.params.number);
    res.json(testSummary(test));
  });
  app.post(
    "/api/tests/:exam/:number/start",
    rateLimit({ windowMs: 60000, limit: 20 }),
    authorizeTest,
    (req, res) => {
      const test = getTest(req.params.exam, req.params.number);
      const ids = req.session.runs ?? [];
      const previous = req.user
        ? db
            .prepare(
              "SELECT * FROM runs WHERE user_id=? AND exam=? AND test_number=? AND result IS NULL ORDER BY started_at DESC LIMIT 1",
            )
            .get(req.user.id, test.exam, String(test.number))
        : ids
            .map((id) => db.prepare("SELECT * FROM runs WHERE id=?").get(id))
            .find(
              (r) =>
                r &&
                r.exam === test.exam &&
                r.test_number === String(test.number) &&
                !r.result,
            );
      let run = previous;
      if (!run) {
        const id = randomUUID(),
          start = now(),
          deadline = start + test.minutes * 60000;
        db.prepare(
          "INSERT INTO runs (id,user_id,exam,test_number,started_at,deadline) VALUES (?,?,?,?,?,?)",
        ).run(
          id,
          req.user?.id ?? null,
          test.exam,
          String(test.number),
          start,
          deadline,
        );
        run = db.prepare("SELECT * FROM runs WHERE id=?").get(id);
      }
      req.session.runs = [...new Set([...ids, run.id])].slice(-25);
      res.json({
        runId: run.id,
        deadline: run.deadline,
        serverNow: now(),
        answers: JSON.parse(run.answers),
        test: publicTest(test),
      });
    },
  );
  const ownedRun = (req, res, next) => {
    const run = db.prepare("SELECT * FROM runs WHERE id=?").get(req.params.id);
    if (
      !run ||
      (!(req.user && run.user_id === req.user.id) &&
        !(run.user_id === null && (req.session.runs ?? []).includes(run.id)))
    )
      return res.status(404).json({ error: "not_found" });
    if (
      !isSample(getTest(run.exam, run.test_number)) &&
      !hasAccess(req, run.exam)
    )
      return res.status(403).json({ error: "access_required" });
    req.run = run;
    next();
  };
  const validAnswers = (test, value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([id, v]) =>
        test.questions.some((q) => q.id === id) &&
        ((typeof v === "string" &&
          v.length <=
            (test.questions.find((q) => q.id === id)?.kind === "essay" ||
            test.questions.find((q) => q.id === id)?.kind === "speaking"
              ? 20000
              : 500)) ||
          (Number.isInteger(v) && v >= 0 && v <= 20)),
    );
  app.put("/api/runs/:id/answers", ownedRun, (req, res) => {
    const run = req.run,
      test = getTest(run.exam, run.test_number);
    if (run.result || now() >= run.deadline)
      return res.status(409).json({ error: "time_up" });
    if (!validAnswers(test, req.body.answers))
      return res.status(400).json({ error: "invalid_answers" });
    db.prepare("UPDATE runs SET answers=? WHERE id=?").run(
      JSON.stringify(req.body.answers),
      run.id,
    );
    res.json({ saved: true, serverNow: now() });
  });
  app.post("/api/runs/:id/submit", ownedRun, (req, res) => {
    const run = req.run,
      test = getTest(run.exam, run.test_number);
    if (run.result) return res.json(JSON.parse(run.result));
    let answers = JSON.parse(run.answers);
    const expired = now() >= run.deadline;
    if (!expired && req.body.answers !== undefined) {
      if (!validAnswers(test, req.body.answers))
        return res.status(400).json({ error: "invalid_answers" });
      answers = req.body.answers;
    }
    const result = {
      ...grade(test, answers),
      runId: run.id,
      exam: run.exam,
      number: run.test_number,
      mode: test.mode,
      set: test.set,
      expired,
      finishedAt: now(),
      durationSeconds: Math.round(
        (Math.min(now(), run.deadline) - run.started_at) / 1000,
      ),
    };
    db.prepare(
      "UPDATE runs SET result=?,answers=?,finished_at=? WHERE id=?",
    ).run(JSON.stringify(result), JSON.stringify(answers), now(), run.id);
    res.json(result);
  });
  app.get("/api/account", login, (req, res) =>
    res.json({
      history: db
        .prepare(
          "SELECT id,exam,test_number,finished_at,result FROM runs WHERE user_id=? AND result IS NOT NULL ORDER BY finished_at DESC LIMIT 30",
        )
        .all(req.user.id)
        .map(({ result, ...r }) => ({
          ...r,
          score: JSON.parse(result).score,
          total: JSON.parse(result).total,
        })),
    }),
  );
  app.get("/api/runs/:id/result", ownedRun, (req, res) =>
    req.run.result
      ? res.json(JSON.parse(req.run.result))
      : res.status(404).json({ error: "not_finished" }),
  );
  app.post(
    "/api/access-requests",
    login,
    rateLimit({ windowMs: 60000, limit: 10 }),
    (req, res) => {
      const exam = req.body.exam;
      if (!examById(exam))
        return res.status(400).json({ error: "invalid_exam" });
      if (hasAccess(req, exam)) return res.json({ status: "approved" });
      db.prepare(
        "INSERT INTO access_requests (user_id,exam) VALUES (?,?) ON CONFLICT(user_id,exam) DO UPDATE SET status='pending',created_at=CURRENT_TIMESTAMP",
      ).run(req.user.id, exam);
      res.json({ status: "pending" });
    },
  );
  app.get("/api/admin", admin, (_req, res) =>
    res.json({
      requests: db
        .prepare(
          "SELECT r.*,u.email,u.name FROM access_requests r JOIN users u ON r.user_id=u.id ORDER BY r.created_at DESC",
        )
        .all(),
      grants: db
        .prepare(
          "SELECT g.*,u.email,u.name FROM grants g JOIN users u ON g.user_id=u.id ORDER BY g.created_at DESC",
        )
        .all(),
    }),
  );
  app.post("/api/admin/access", admin, (req, res) => {
    const { userId, exam, action } = req.body;
    if (
      !Number.isInteger(userId) ||
      !examById(exam) ||
      !["approve", "revoke", "reject"].includes(action) ||
      !db.prepare("SELECT id FROM users WHERE id=?").get(userId)
    )
      return res.status(400).json({ error: "invalid_request" });
    db.exec("BEGIN");
    try {
      if (action === "approve")
        db.prepare(
          "INSERT OR REPLACE INTO grants (user_id,exam,granted_by) VALUES (?,?,?)",
        ).run(userId, exam, req.user.id);
      else if (action === "revoke")
        db.prepare("DELETE FROM grants WHERE user_id=? AND exam=?").run(
          userId,
          exam,
        );
      db.prepare(
        "UPDATE access_requests SET status=? WHERE user_id=? AND exam=?",
      ).run(action === "approve" ? "approved" : "rejected", userId, exam);
      db.prepare(
        "INSERT INTO audit (actor_id,user_id,exam,action) VALUES (?,?,?,?)",
      ).run(req.user.id, userId, exam, action);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  });
  app.get("/api/guides/:exam", (req, res) => {
    if (!examById(req.params.exam))
      return res.status(404).json({ error: "not_found" });
    const guides = JSON.parse(
      fs.readFileSync(
        new URL("../content/guides.json", import.meta.url),
        "utf8",
      ),
    );
    res.json(guides[req.params.exam]);
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));
  const dist = path.resolve("dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((err, req, res, _next) => {
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ error: "invalid_json" });
    console.error("Request failed:", err.name);
    res.status(500).json({ error: "server_error" });
  });
  return app;
}
