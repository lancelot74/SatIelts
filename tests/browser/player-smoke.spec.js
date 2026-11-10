import { test, expect } from "@playwright/test";

test("a sample question and its saved state render without a page error", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.goto("/ielts/tests/sample");
  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(page.locator(".question-title")).toContainText(
    "Over half of the world",
  );
  await expect(page.getByRole("status")).toContainText("Answers saved");
  expect(errors).toEqual([]);
});
