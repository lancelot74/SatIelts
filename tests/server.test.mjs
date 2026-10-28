import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import fs from "node:fs";
import { openDatabase, sqlStatements, toPostgres } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { getTest, tests, grade, publicTest } from "../server/tests.mjs";
const config = {
  origin: "http://localhost:5173",
  sessionSecret: "test-secret-only-at-least-thirty-two-characters",
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  redirectUri: "http://localhost:5173/api/auth/google/callback",
  adminEmails: "owner@example.com",
};
function fixture() {
  const db = openDatabase(":memory:");
  let clock = Date.now(),
    pending;
  const oauthClient = {
    generateAuthUrl(opts) {
      pending = opts;
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
    },
    async getToken({ code, codeVerifier }) {
      assert.ok(codeVerifier);
      return { tokens: { id_token: code } };
    },
    async verifyIdToken({ idToken }) {
      return {
        getPayload: () => ({
          sub: idToken,
          email: `${idToken}@example.com`,
          name: idToken,
          email_verified: true,
          nonce: pending.nonce,
        }),
      };
    },
  };
  const app = createApp({ db, config, oauthClient, now: () => clock });
  return {
    db,
    app,
    advance: (ms) => (clock += ms),
    agent: () => supertest.agent(app),
  };
}
async function session(agent) {
  return (await agent.get("/api/session").expect(200)).body;
}
async function login(agent, name) {
  const begin = await agent.get("/api/auth/google").expect(302);
  const state = new URL(begin.headers.location).searchParams.get("state");
  await agent
    .get(`/api/auth/google/callback?state=${state}&code=${name}`)
    .expect(302);
  return session(agent);
}
const mutate = (agent, method, url, csrf, body) =>
  agent[method](url)
    .set("x-csrf-token", csrf)
    .set("Origin", config.origin)
    .send(body ?? {});
test("hosted postgres uses portable timestamps, placeholders, and locked-down tables", () => {
  assert.equal(
    toPostgres("SELECT * FROM runs WHERE id=? AND exam=?"),
    "SELECT * FROM runs WHERE id=$1 AND exam=$2",
  );
  const schema = fs.readFileSync(
    new URL("../server/schema.postgres.sql", import.meta.url),
    "utf8",
  );
  const statements = sqlStatements(schema);
  assert.equal(statements.length, 16);
  assert.ok(statements.some((s) => s.includes("started_at bigint")));
  assert.ok(statements.some((s) => s.includes("expires bigint")));
  assert.equal(
    statements.filter((s) => s.startsWith("ALTER TABLE") && s.includes("ENABLE ROW LEVEL SECURITY")).length,
    7,
  );
  assert.equal(schema.includes("INSERT OR REPLACE"), false);
  assert.equal(schema.includes("PRAGMA"), false);
});
test("health reports the open database", async () => {
  const body = (await fixture().agent().get("/api/health").expect(200)).body;
  assert.equal(body.status, "ok");
  assert.equal(body.database, "sqlite");
});
test("all imported questions have bilingual hints and valid scoring; answer keys are private", () => {
  assert.equal(Object.keys(tests).length, 18);
  assert.equal(
    Object.entries(tests)
      .filter(([k]) => !k.endsWith("sample"))
      .reduce((n, [, t]) => n + t.questions.length, 0),
    210,
  );
  for (const t of Object.values(tests)) {
    assert.ok(t.minutes > 0);
    assert.equal(
      new Set(t.questions.map((q) => q.id)).size,
      t.questions.length,
    );
    for (const q of t.questions) {
      assert.ok(q.prompt.en);
      assert.ok(/[А-Яа-яӨөҮү]/.test(q.prompt.mn));
      assert.notEqual(q.prompt.en, q.prompt.mn);
      assert.ok(!/Сорилын Шалгалтууд/.test(q.prompt.en));
      if (q.options) {
        assert.ok(q.options.length >= 3);
        for (const o of q.options) {
          assert.ok(o.mn);
          assert.ok(!/Сорил \d/.test(o.en));
        }
        for (const answer of Array.isArray(q.answer) ? q.answer : [q.answer])
          assert.ok(
            Number.isInteger(answer) && q.options[answer],
            `${t.exam}-${t.number} ${q.id}`,
          );
      }
    }
    const answers = Object.fromEntries(
      t.questions.map((q) => [
        q.id,
        Array.isArray(q.answer) ? q.answer[0] : q.answer,
      ]),
    );
    assert.equal(grade(t, answers).score, t.questions.length);
    assert.equal(grade(t, {}).score, 0);
    for (const q of publicTest(t).questions) {
      assert.equal(q.answer, undefined);
      assert.equal(q.accepted, undefined);
      assert.equal(q.explanation, undefined);
    }
  }
});
test("digit and word numbers are the same answer", () => {
  const t = getTest("ielts", "length-listening-1");
  const graded = grade(t, {
    "listening-1": "five",
    "listening-3": "fourteenth",
    "listening-4": "mill",
  });
  const byId = Object.fromEntries(graded.results.map((q) => [q.id, q.correct]));
  assert.equal(byId["listening-1"], true);
  assert.equal(byId["listening-3"], true);
  assert.equal(byId["listening-4"], true);
  const pub = publicTest(t);
  assert.equal(
    pub.questions.find((q) => q.id === "listening-1").answerForm,
    "number",
  );
  assert.equal(
    pub.questions.find((q) => q.id === "listening-0").answerForm,
    "",
  );
  const perfect = grade(
    t,
    Object.fromEntries(t.questions.map((q) => [q.id, q.answer])),
  );
  assert.equal(perfect.score, 40);
  assert.equal(perfect.band, 9);
  assert.equal(pub.questions[0].answer, undefined);
});
test("equivalent mathematical answers are accepted without accepting blanks", () => {
  const t = getTest("sat", "3");
  assert.equal(grade(t, { 15: "45*pi", 19: "sqrt(50)" }).score, 2);
  assert.equal(grade(getTest("sat", "1"), { 19: 3 }).score, 1);
  assert.equal(grade(getTest("ielts", "1"), { 5: "  SPONGES " }).score, 1);
});
test("anonymous user can take and review samples, but cannot read or start a paid test", async () => {
  const f = fixture(),
    a = f.agent(),
    s = await session(a);
  await a.get("/api/tests/ielts/1").expect(401);
  await mutate(a, "post", "/api/tests/ielts/1/start", s.csrf).expect(401);
  const start = (
    await mutate(a, "post", "/api/tests/ielts/sample/start", s.csrf).expect(200)
  ).body;
  assert.equal(start.test.questions.length, 6);
  assert.equal(start.test.questions[0].answer, undefined);
  const resume = (
    await mutate(a, "post", "/api/tests/ielts/sample/start", s.csrf).expect(200)
  ).body;
  assert.equal(resume.runId, start.runId);
  assert.equal(resume.deadline, start.deadline);
  const result = (
    await mutate(a, "post", `/api/runs/${start.runId}/submit`, s.csrf, {
      answers: { 0: 0, 1: 1, 2: 0, 3: 2, 4: 0, 5: "sponges" },
    }).expect(200)
  ).body;
  assert.equal(result.score, 6);
  assert.equal(result.total, 6);
  const repeated = (
    await mutate(a, "post", `/api/runs/${start.runId}/submit`, s.csrf, {
      answers: {},
    }).expect(200)
  ).body;
  assert.deepEqual(repeated, result);
  const b = f.agent();
  await session(b);
  await b.get(`/api/runs/${start.runId}/result`).expect(404);
  f.db.close();
});
test("deadline is enforced on the server; reload cannot reset it; late answers are discarded", async () => {
  const f = fixture(),
    a = f.agent(),
    s = await session(a);
  const start = (
    await mutate(a, "post", "/api/tests/sat/sample/start", s.csrf).expect(200)
  ).body;
  await mutate(a, "put", `/api/runs/${start.runId}/answers`, s.csrf, {
    answers: { 0: 2 },
  }).expect(200);
  f.advance(8 * 60000 + 1);
  const resume = (
    await mutate(a, "post", "/api/tests/sat/sample/start", s.csrf, {
      deadline: Date.now() + 99999999,
    }).expect(200)
  ).body;
  assert.equal(resume.deadline, start.deadline);
  await mutate(a, "put", `/api/runs/${start.runId}/answers`, s.csrf, {
    answers: { 0: 2, 1: 1 },
  }).expect(409);
  const result = (
    await mutate(a, "post", `/api/runs/${start.runId}/submit`, s.csrf, {
      answers: { 0: 2, 1: 1 },
    }).expect(200)
  ).body;
  assert.equal(result.expired, true);
  assert.equal(result.score, 1);
  assert.equal(result.results[1].supplied, "");
  f.db.close();
});
test("Google callback rejects invalid state and does not create an account", async () => {
  const f = fixture(),
    a = f.agent();
  await a.get("/api/auth/google");
  const r = await a
    .get("/api/auth/google/callback?state=wrong&code=owner")
    .expect(302);
  assert.equal(r.headers.location, "/login?error=sign_in_failed");
  assert.equal((await session(a)).user, null);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get().n, 0);
  f.db.close();
});
test("manual access approval, per-exam isolation, revocation, admin restrictions and history", async () => {
  const f = fixture(),
    student = f.agent(),
    owner = f.agent();
  const s = await login(student, "learner");
  const o = await login(owner, "owner");
  assert.equal(s.user.isAdmin, false);
  assert.equal(o.user.isAdmin, true);
  await student.get("/api/admin").expect(403);
  await mutate(student, "post", "/api/admin/access", s.csrf, {
    userId: s.user.id,
    exam: "ielts",
    action: "approve",
  }).expect(403);
  await mutate(student, "post", "/api/access-requests", s.csrf, {
    exam: "ielts",
  }).expect(200);
  await mutate(student, "post", "/api/access-requests", s.csrf, {
    exam: "ielts",
  }).expect(200);
  assert.equal(
    (await owner.get("/api/admin").expect(200)).body.requests.length,
    1,
  );
  await student.get("/api/tests/ielts/1").expect(403);
  await mutate(owner, "post", "/api/admin/access", o.csrf, {
    userId: s.user.id,
    exam: "ielts",
    action: "approve",
  }).expect(200);
  await student.get("/api/tests/ielts/1").expect(200);
  await student.get("/api/tests/sat/1").expect(403);
  const run = (
    await mutate(student, "post", "/api/tests/ielts/1/start", s.csrf).expect(
      200,
    )
  ).body;
  await mutate(student, "post", `/api/runs/${run.runId}/submit`, s.csrf, {
    answers: { 0: 0 },
  }).expect(200);
  const history = (await student.get("/api/account").expect(200)).body.history;
  assert.equal(history.length, 1);
  assert.equal(history[0].score, 1);
  await mutate(owner, "post", "/api/admin/access", o.csrf, {
    userId: s.user.id,
    exam: "ielts",
    action: "revoke",
  }).expect(200);
  await student.get("/api/tests/ielts/1").expect(403);
  await student.get(`/api/runs/${run.runId}/result`).expect(403);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit").get().n, 2);
  f.db.close();
});

test("one plan approval unlocks IELTS, TOEFL, and SAT", async () => {
  const f = fixture(),
    student = f.agent(),
    owner = f.agent();
  const s = await login(student, "learner");
  const o = await login(owner, "owner");
  await mutate(student, "post", "/api/access-requests", s.csrf, {
    exam: "all",
    plan: "month-3",
  }).expect(200);
  const request = (await owner.get("/api/admin").expect(200)).body.requests[0];
  assert.equal(request.exam, "all");
  assert.equal(request.plan, "month-3");
  await student.get("/api/tests/sat/1").expect(403);
  await mutate(owner, "post", "/api/admin/access", o.csrf, {
    userId: s.user.id,
    exam: "all",
    action: "approve",
  }).expect(200);
  await student.get("/api/tests/ielts/1").expect(200);
  await student.get("/api/tests/toefl/1").expect(200);
  await student.get("/api/tests/sat/1").expect(200);
  await mutate(owner, "post", "/api/admin/access", o.csrf, {
    userId: s.user.id,
    exam: "all",
    action: "revoke",
  }).expect(200);
  await student.get("/api/tests/ielts/1").expect(403);
  await student.get("/api/tests/sat/1").expect(403);
  f.db.close();
});
test("CSRF, request validation and logout protect authenticated mutations", async () => {
  const f = fixture(),
    a = f.agent(),
    s = await login(a, "learner");
  await a.post("/api/access-requests").send({ exam: "ielts" }).expect(403);
  await a
    .post("/api/access-requests")
    .set("x-csrf-token", s.csrf)
    .set("Origin", "https://bad.example")
    .send({ exam: "ielts" })
    .expect(403);
  await mutate(a, "post", "/api/access-requests", s.csrf, {
    exam: "../source",
  }).expect(400);
  const run = (
    await mutate(a, "post", "/api/tests/toefl/sample/start", s.csrf).expect(200)
  ).body;
  await mutate(a, "put", `/api/runs/${run.runId}/answers`, s.csrf, {
    answers: { unknown: "wrong" },
  }).expect(400);
  await mutate(a, "post", "/api/logout", s.csrf).expect(200);
  assert.equal((await session(a)).user, null);
  await a.get("/api/account").expect(401);
  f.db.close();
});
test("private files and invalid exams are not exposed by production server routes", async () => {
  const f = fixture(),
    a = f.agent();
  for (const p of [
    "/content/tests.json",
    "/content/source/IELTS_Mock_Tests_MN.pdf",
    "/server/tests.mjs",
    "/.data/studyroom.sqlite",
  ]) {
    const r = await a.get(p);
    assert.ok(r.status === 404 || r.type === "text/html");
    assert.ok(!r.text?.includes('"answer"'));
  }
  await a.get("/api/tests/fake/sample").expect(404);
  await a.get("/api/guides/fake").expect(404);
  const guide = (await a.get("/api/guides/ielts").expect(200)).body;
  assert.equal(guide.chapters.length, 4);
  assert.ok(guide.chapters[0].body.length > 100);
  f.db.close();
});

test("section libraries contain complete, bilingual source tasks and full tests compose all sections", async () => {
  const { practiceModes, variants } = await import("../server/tests.mjs");
  for (const [exam, modes] of Object.entries(practiceModes)) {
    for (const set of ["sample", 1, 2, 3, 4, 5]) {
      const sections = modes
        .filter((m) => m.id !== "full")
        .map((m) => getTest(exam, `${m.id}-${set}`));
      const full = getTest(exam, `full-${set}`);
      assert.equal(
        full.minutes,
        sections.reduce((sum, t) => sum + t.minutes, 0),
      );
      assert.deepEqual(
        full.questions,
        sections.flatMap((t) => t.questions),
      );
      assert.equal(full.outline.length, sections.length);
      assert.equal(
        new Set(full.questions.map((q) => q.id)).size,
        full.questions.length,
      );
    }
  }
  assert.equal(getTest("sat", "reading-1").questions.length, 10);
  assert.equal(getTest("sat", "math-1").questions.length, 10);
  assert.equal(getTest("sat", "math-1").minutes, 16);
  assert.equal(getTest("ielts", "full-1").questions.length, 34);
  assert.equal(getTest("toefl", "full-1").questions.length, 29);
  assert.equal(getTest("toefl", "full-2").questions.length, 28);
  assert.equal(getTest("sat", "listening-1"), undefined);
  for (const t of Object.values(variants)) {
    for (const q of t.questions) {
      assert.ok(
        q.prompt.en && /[А-Яа-яӨөҮү]/.test(q.prompt.mn),
        `${t.exam}/${t.number}/${q.id}`,
      );
      assert.ok(!/Сорил \d|IELTS Academic ·|SAMPLE \(~/.test(q.prompt.en));
      if (q.options) {
        assert.ok(q.options.length >= 3);
        for (const option of q.options) assert.ok(option.en && option.mn);
      }
    }
    const answers = Object.fromEntries(
      t.questions.map((q) => [
        q.id,
        Array.isArray(q.answer) ? q.answer[0] : (q.answer ?? "My response"),
      ]),
    );
    const result = grade(t, answers);
    assert.equal(result.score, result.total);
    assert.equal(result.total + result.selfReviewCount, t.questions.length);
    assert.equal(grade(t, {}).score, 0);
    for (const q of publicTest(t).questions) {
      assert.equal(q.answer, undefined);
      assert.equal(q.accepted, undefined);
      assert.equal(q.explanation, undefined);
    }
  }
});

test("section and full samples have separate attempts, deadlines and saved answers", async () => {
  const f = fixture(),
    a = f.agent(),
    s = await session(a);
  const catalog = (await a.get("/api/catalog").expect(200)).body;
  assert.deepEqual(
    catalog.find((e) => e.id === "sat").modes.map((m) => m.id),
    ["reading", "math", "full"],
  );
  assert.equal(catalog.find((e) => e.id === "ielts").modes.length, 5);
  assert.ok(!JSON.stringify(catalog).includes('"answer"'));
  const reading = (
    await mutate(
      a,
      "post",
      "/api/tests/sat/reading-sample/start",
      s.csrf,
    ).expect(200)
  ).body;
  await mutate(a, "put", `/api/runs/${reading.runId}/answers`, s.csrf, {
    answers: { "reading-0": 2 },
  }).expect(200);
  f.advance(60000);
  const math = (
    await mutate(a, "post", "/api/tests/sat/math-sample/start", s.csrf).expect(
      200,
    )
  ).body;
  const full = (
    await mutate(a, "post", "/api/tests/sat/full-sample/start", s.csrf).expect(
      200,
    )
  ).body;
  assert.equal(new Set([reading.runId, math.runId, full.runId]).size, 3);
  assert.deepEqual(math.answers, {});
  assert.equal(math.deadline - math.serverNow, 4 * 60000);
  assert.equal(full.deadline - full.serverNow, 8 * 60000);
  const resume = (
    await mutate(
      a,
      "post",
      "/api/tests/sat/reading-sample/start",
      s.csrf,
    ).expect(200)
  ).body;
  assert.equal(resume.deadline, reading.deadline);
  assert.deepEqual(resume.answers, { "reading-0": 2 });
  // Question IDs from a different section are not accepted for this attempt.
  await mutate(a, "put", `/api/runs/${math.runId}/answers`, s.csrf, {
    answers: { "reading-0": 2 },
  }).expect(400);
  f.advance(3 * 60000 + 1);
  await mutate(a, "put", `/api/runs/${reading.runId}/answers`, s.csrf, {
    answers: { "reading-0": 2 },
  }).expect(409);
  const result = (
    await mutate(a, "post", `/api/runs/${reading.runId}/submit`, s.csrf).expect(
      200,
    )
  ).body;
  assert.equal(result.score, 1);
  assert.equal(result.total, 3);
  await mutate(a, "put", `/api/runs/${math.runId}/answers`, s.csrf, {
    answers: { "math-0": 1 },
  }).expect(200);
  f.db.close();
});

test("one exam grant unlocks all its sections and full tests, and revocation protects existing runs", async () => {
  const f = fixture(),
    learner = f.agent(),
    owner = f.agent();
  const s = await login(learner, "section-learner"),
    o = await login(owner, "owner");
  for (const mode of ["reading", "listening", "writing", "speaking", "full"]) {
    await learner.get(`/api/tests/ielts/${mode}-1`).expect(403);
    await mutate(
      learner,
      "post",
      `/api/tests/ielts/${mode}-1/start`,
      s.csrf,
    ).expect(403);
    await learner.get(`/api/tests/ielts/${mode}-sample`).expect(200);
  }
  await mutate(owner, "post", "/api/admin/access", o.csrf, {
    userId: s.user.id,
    exam: "ielts",
    action: "approve",
  }).expect(200);
  for (const mode of ["reading", "listening", "writing", "speaking", "full"])
    await learner.get(`/api/tests/ielts/${mode}-1`).expect(200);
  await learner.get("/api/tests/toefl/full-1").expect(403);
  const run = (
    await mutate(
      learner,
      "post",
      "/api/tests/ielts/full-1/start",
      s.csrf,
    ).expect(200)
  ).body;
  await mutate(owner, "post", "/api/admin/access", o.csrf, {
    userId: s.user.id,
    exam: "ielts",
    action: "revoke",
  }).expect(200);
  await mutate(learner, "post", `/api/runs/${run.runId}/submit`, s.csrf).expect(
    403,
  );
  await learner.get("/api/tests/ielts/writing-1").expect(403);
  await learner.get("/api/tests/sat/listening-sample").expect(404);
  f.db.close();
});

test("long writing responses survive reload and are reviewed without fabricated scores", async () => {
  const f = fixture(),
    a = f.agent(),
    s = await login(a, "writer");
  const start = (
    await mutate(
      a,
      "post",
      "/api/tests/ielts/writing-sample/start",
      s.csrf,
    ).expect(200)
  ).body;
  const essay = "Here is a sentence about the data. ".repeat(80);
  const answers = { "writing-0": essay };
  await mutate(a, "put", `/api/runs/${start.runId}/answers`, s.csrf, {
    answers,
  }).expect(200);
  const resume = (
    await mutate(
      a,
      "post",
      "/api/tests/ielts/writing-sample/start",
      s.csrf,
    ).expect(200)
  ).body;
  assert.deepEqual(resume.answers, answers);
  await mutate(a, "put", `/api/runs/${start.runId}/answers`, s.csrf, {
    answers: { "writing-0": "a".repeat(20001) },
  }).expect(400);
  const result = (
    await mutate(a, "post", `/api/runs/${start.runId}/submit`, s.csrf, {
      answers,
    }).expect(200)
  ).body;
  assert.equal(result.score, 0);
  assert.equal(result.total, 0);
  assert.equal(result.selfReviewCount, 1);
  assert.equal(result.results[0].correct, null);
  assert.equal(result.results[0].supplied, essay);
  assert.equal(result.runId, start.runId);
  assert.equal(result.mode, "writing");
  const saved = (await a.get(`/api/runs/${start.runId}/result`).expect(200))
    .body;
  assert.deepEqual(saved, result);
  assert.equal(
    (await a.get("/api/account").expect(200)).body.history[0].test_number,
    "writing-sample",
  );
  f.db.close();
});

test("alias domains redirect to eightsteppe.org and the canonical host does not", async () => {
  const { app } = fixture();
  const alias = await supertest(app)
    .get("/practice?exam=sat")
    .set("Host", "www.eightsteppe.com")
    .expect(301);
  assert.equal(
    alias.headers.location,
    "https://eightsteppe.org/practice?exam=sat",
  );
  const apex = await supertest(app)
    .get("/guides")
    .set("Host", "eightsteppe.com")
    .expect(301);
  assert.equal(apex.headers.location, "https://eightsteppe.org/guides");
  await supertest(app).get("/api/health").set("Host", "eightsteppe.org").expect(200);
});

test("full-test grading separates objective results from open responses", () => {
  const full = getTest("toefl", "full-1");
  const result = grade(full, {
    "reading-0": "magma",
    "listening-0": 0,
    "writing-0": "I was late because the bus broke down",
    "writing-3": "My email",
    "speaking-0": "My notes",
  });
  assert.equal(result.score, 3);
  assert.equal(result.total, 25);
  assert.equal(result.selfReviewCount, 4);
  assert.deepEqual(
    result.sectionResults.map((s) => [s.section, s.score, s.total]),
    [
      ["Reading", 1, 14],
      ["Listening", 1, 8],
      ["Writing", 1, 3],
      ["Speaking", 0, 0],
    ],
  );
  assert.ok(
    !publicTest(full)
      .questions.find((q) => q.id === "reading-0")
      .passage.includes("(magma)"),
  );
});
