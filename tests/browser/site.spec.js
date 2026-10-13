import { test, expect } from "@playwright/test";
async function english(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
}
async function googleLogin(page, name) {
  await page.goto("/login");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: `Use test account ${name}` }).click();
  await expect(page).toHaveURL("/account");
}
test("homepage, language persistence, all exam pages and guide chapters", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await english(page);
  await expect(
    page.getByRole("heading", { name: "A little practice. A bigger world." }),
  ).toBeVisible();
  for (const exam of ["ielts", "toefl", "sat"]) {
    await page.goto("/" + exam);
    await expect(page.locator("h1")).toContainText(exam.toUpperCase());
    await expect(page.locator(".test-row")).toHaveCount(5);
    await page.getByRole("link", { name: "Read the guide" }).click();
    await expect(page.locator(".lesson-original")).not.toBeEmpty();
    await page.getByRole("button", { name: /04/ }).click();
    await expect(page.locator(".lesson>.tag")).toContainText("04");
  }
  await page.getByRole("button", { name: "MN", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "mn");
  expect(errors).toEqual([]);
});
test("free sample: Mongolian hints, saved answers, reload, flagging, score and review", async ({
  page,
}) => {
  await english(page);
  await page.goto("/ielts/tests/sample");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.locator(".question-title")).toContainText(
    "Over half of the world",
  );
  await page
    .getByRole("button", { name: "Монгол тусламж", exact: true })
    .click();
  await expect(page.locator(".translation-note")).toContainText("20-р зуунд");
  await expect(page.locator(".option-copy small").first()).toHaveText("Үнэн");
  await page.getByRole("radio").nth(0).check();
  await expect(page.getByRole("status")).toContainText("Answers saved");
  await page.getByRole("button", { name: "Mark for review" }).click();
  await expect(
    page.getByRole("button", {
      name: "Question 1, Marked for review",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.getByRole("radio").first()).toBeChecked();
  const answers = [0, 1, 0, 2, 0, "sponges"];
  for (let i = 0; i < answers.length; i++) {
    if (i > 0)
      await page
        .getByRole("button", { name: `Question ${i + 1}`, exact: true })
        .click();
    if (typeof answers[i] === "number")
      await page.getByRole("radio").nth(answers[i]).check();
    else
      await page
        .getByPlaceholder("Type your answer in English")
        .fill(answers[i]);
  }
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.locator(".score-card")).toContainText("100");
  await expect(page.locator(".review-item")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Монгол тусламж", exact: true })
    .click();
  await page.locator(".review-item summary").first().click();
  await expect(page.locator(".review-body").first()).toContainText(
    "Эхний догол мөр",
  );
});
test("all three free samples can be completed and paid tests show the access gate", async ({
  page,
}) => {
  await english(page);
  for (const exam of ["sat", "toefl"]) {
    await page.goto(`/${exam}/tests/sample`);
    await page.getByRole("button", { name: "Begin practice" }).click();
    await page.getByRole("radio").first().check();
    await page
      .getByRole("button", { name: "Finish practice", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toContainText("unanswered");
    await page.getByRole("button", { name: "Finish and see results" }).click();
    await expect(page.locator("h1")).toHaveText("A step forward.");
  }
  await page.goto("/sat/tests/1");
  await expect(
    page.getByRole("heading", {
      name: "One exam. The whole practice collection.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toBeVisible();
  expect((await page.request.get("/api/tests/sat/1")).status()).toBe(401);
});
test("Google account, access request, admin approval, member test and revocation", async ({
  browser,
}) => {
  const student = await browser.newContext(),
    owner = await browser.newContext();
  const s = await student.newPage(),
    o = await owner.newPage();
  await english(s);
  await googleLogin(s, "student");
  await s.goto("/toefl/tests/1");
  await s.getByRole("button", { name: "Request access", exact: true }).click();
  await expect(s.locator(".notice.success")).toContainText("Request sent");
  await english(o);
  await googleLogin(o, "owner");
  await o.getByRole("link", { name: "Manage access" }).click();
  await o.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(o.getByRole("button", { name: "Revoke access" })).toBeVisible();
  await s.reload();
  await s.getByRole("button", { name: "Begin practice" }).click();
  await expect(s.locator(".question-title")).toContainText("gym");
  await s.getByRole("radio").nth(1).check();
  await s
    .getByRole("button", { name: "Finish practice", exact: true })
    .first()
    .click();
  await s.getByRole("button", { name: "Finish and see results" }).click();
  await s.goto("/account");
  await expect(s.locator(".history-table")).toContainText("1/9");
  await o.getByRole("button", { name: "Revoke access", exact: true }).click();
  await o
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await expect(o.getByText("No active grants yet.")).toBeVisible();
  await s.goto("/toefl/tests/1");
  await expect(
    s.getByRole("heading", {
      name: "One exam. The whole practice collection.",
    }),
  ).toBeVisible();
  await student.close();
  await owner.close();
});
test("mobile navigation and test controls fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await english(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "IELTS" })
    .click();
  await expect(page).toHaveURL("/ielts");
  for (const path of [
    "/",
    "/ielts",
    "/toefl",
    "/sat",
    "/login",
    "/ielts/guide",
    "/sat/tests/1",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/sat/tests/sample");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await page
    .getByRole("button", { name: "Монгол тусламж", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next question", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

// Advance the browser clock to exercise automatic submission. Server-side expiry
// and discarding late answers are verified independently by server.test.mjs.
test("the browser submits automatically when the countdown reaches zero", async ({
  page,
}) => {
  await page.clock.install();
  await english(page);
  await page.goto("/sat/tests/sample");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await page.getByRole("radio").nth(2).check();
  await expect(page.getByRole("status")).toContainText("Answers saved");
  await page.clock.fastForward(8 * 60000 + 1500);
  await expect(page.locator("h1")).toHaveText("A step forward.");
  await expect(page.locator(".score-card")).toContainText("1 / 6 correct");
});

test("learners choose each skill or a full test, with persistent selection and bilingual labels", async ({
  page,
}) => {
  await english(page);
  for (const [exam, modes] of [
    ["sat", ["Reading & Writing", "Math", "Full test"]],
    ["toefl", ["Reading", "Listening", "Writing", "Speaking", "Full test"]],
    ["ielts", ["Reading", "Listening", "Writing", "Speaking", "Full test"]],
  ]) {
    await page.goto(`/${exam}`);
    const picker = page.getByRole("group", { name: "Choose your practice" });
    for (const mode of modes) {
      await picker.getByRole("button", { name: mode, exact: true }).click();
      await expect(
        picker.getByRole("button", { name: mode, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".test-row")).toHaveCount(5);
      await expect(page.locator(".mode-description h3")).toHaveText(mode);
    }
    await page.reload();
    await expect(
      picker.getByRole("button", { name: "Full test", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator(".test-row").first().click();
    await expect(page.locator(".access-copy")).toContainText(
      "individual sections and full tests",
    );
  }
  await page.goto("/sat?section=math");
  await page.getByRole("button", { name: "MN", exact: true }).click();
  await expect(page.locator(".mode-description h3")).toHaveText("Математик");
  await expect(page.locator(".practice-modes")).toContainText("Бүтэн сорил");
});

test("SAT Math has its own sample and timer; full SAT navigates and scores both sections", async ({
  page,
}) => {
  await english(page);
  await page.goto("/sat?section=math");
  await page.locator(".sample-card").click();
  await expect(page).toHaveURL("/sat/tests/math-sample");
  await expect(page.locator(".test-outline")).toContainText(
    "3 questions / tasks · 4 min",
  );
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.locator(".player-toolbar p")).toHaveText("Math");
  await expect(page.getByRole("timer")).toHaveText(/03:|04:00/);
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).toContainText("Answers saved");
  await page.goto("/sat/tests/full-sample");
  await expect(page.locator(".test-outline > div")).toHaveCount(2);
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.getByRole("timer")).toHaveText(/07:|08:00/);
  await page.getByRole("radio").nth(2).check();
  await page
    .getByRole("navigation", { name: "Choose your practice" })
    .getByRole("button", { name: /Math/ })
    .click();
  await expect(page.getByRole("radio").nth(1)).not.toBeChecked();
  await page.getByRole("radio").nth(1).check();
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.locator(".section-results")).toContainText(
    "Reading & Writing",
  );
  await expect(page.locator(".section-results")).toContainText("Math");
  await expect(page.locator(".score-card")).toContainText("2 / 6 correct");
});

test("IELTS full practice saves essays, shows transcript help and separates self-review", async ({
  page,
}) => {
  await english(page);
  await page.goto("/ielts/tests/full-sample");
  await expect(page.locator(".test-outline > div")).toHaveCount(4);
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.locator(".passage-panel")).toContainText(
    "LISTENING TRANSCRIPT",
  );
  await page.getByPlaceholder("Type your answer in English").fill("Barrett");
  await page
    .getByRole("button", { name: "Монгол тусламж", exact: true })
    .click();
  await expect(page.locator(".translation-note").last()).toContainText("Овог");
  const sections = page.getByRole("navigation", {
    name: "Choose your practice",
  });
  await sections.getByRole("button", { name: /Writing/ }).click();
  await expect(page.locator(".task-table")).toContainText("Country A");
  const essay = "Internet access increased in all four countries. ".repeat(35);
  await page.getByPlaceholder("Write your response in English…").fill(essay);
  await expect(page.locator(".long-response")).toContainText("245 words");
  await expect(page.getByRole("status")).toContainText("Answers saved");
  await page.reload();
  await page.getByRole("button", { name: "Begin practice" }).click();
  await sections.getByRole("button", { name: /Writing/ }).click();
  await expect(
    page.getByPlaceholder("Write your response in English…"),
  ).toHaveValue(essay);
  await sections.getByRole("button", { name: /Speaking/ }).click();
  await page
    .getByPlaceholder("Answer aloud, then add notes or type a transcript…")
    .fill("I live in Ulaanbaatar.");
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.locator(".score-card")).toContainText("1 / 9 correct");
  await expect(page.locator(".section-results > div")).toHaveCount(4);
  await expect(page.locator(".review-item.self-review")).toHaveCount(2);
  await expect(page.locator(".review-item.self-review").first()).toContainText(
    essay.trim(),
  );
  await expect(
    page.locator(".review-item.self-review").first(),
  ).not.toContainText("Correct answer");
});

test("TOEFL writing sample displays self-review, and speaking recordings survive reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await english(page);
  await page.goto("/toefl/tests/writing-sample");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await page
    .getByPlaceholder("Write your response in English…")
    .fill(
      "Dear Customer Service, I received the wrong book. Please send the correct title.",
    );
  await page
    .getByRole("button", { name: "Монгол тусламж", exact: true })
    .click();
  await expect(page.locator(".translation-note")).toContainText(
    "буруу нэртэй ном",
  );
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.locator(".score-card")).toContainText("Self-review");
  await expect(page.locator(".score-card")).not.toContainText("NaN");
  await expect(page.locator(".review-explanation")).toContainText(
    "Dear Customer Service",
  );
  await page.goto("/toefl/tests/speaking-sample");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await page
    .getByRole("button", { name: "Record your answer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Stop recording · 0:01/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Stop recording/ }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page
    .getByPlaceholder("Answer aloud, then add notes or type a transcript…")
    .fill("Repeated all seven sentences.");
  await expect(page.getByRole("status")).toContainText("Answers saved");
  await page.reload();
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Finish and see results" }).click();
  await expect(page.locator(".review-body audio")).toBeVisible();
  await expect(page.locator(".score-card")).toContainText("Self-review");
});

test("section selectors, full-test navigation and essay controls fit a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await english(page);
  for (const exam of ["sat", "ielts", "toefl"]) {
    await page.goto(`/${exam}?section=full`);
    await expect(page.locator(".practice-mode.selected")).toHaveText(
      "Full test",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".sample-card").click();
    await page.getByRole("button", { name: "Begin practice" }).click();
    if (exam !== "sat") {
      await page
        .getByRole("navigation", { name: "Choose your practice" })
        .getByRole("button", { name: /Writing/ })
        .click();
      await expect(page.locator("textarea")).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
