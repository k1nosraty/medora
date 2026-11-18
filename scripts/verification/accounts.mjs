import { chromium, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const [origin, inbox] = process.argv.slice(2).map((v) => new URL(v));
if (
  ![origin, inbox].every(
    (u) =>
      u.protocol === "http:" &&
      u.hostname === "127.0.0.1" &&
      !u.username &&
      !u.password,
  )
)
  throw Error("Two isolated loopback endpoints required");
const browser = await chromium.launch({
  executablePath: process.env.MEDORA_CHROMIUM,
});
const timeout = 30000;
const fresh = () => randomBytes(12).toString("hex");
async function codeFor(email, previous) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const response = await fetch(new URL("/api/v1/messages?limit=100", inbox));
    const items = (await response.json()).messages;
    const latest = items.find(
      (item) =>
        item.ID !== previous && item.To.some((to) => to.Address === email),
    );
    if (latest) {
      const message = await (
        await fetch(
          new URL("/api/v1/message/" + encodeURIComponent(latest.ID), inbox),
        )
      ).json();
      const match = message.Text.match(/^([0-9]{6})$/m);
      if (match) return { code: match[1], id: latest.ID };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Fixture delivery timed out");
}
async function accountPage(page) {
  await page.goto(origin.href);
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Account", exact: true }).click();
}
async function challenge(page, user, purpose) {
  const details = page.locator("details");
  if (
    !(await details.getAttribute("open")) &&
    !(await details.evaluate((el) => el.open))
  )
    await details.locator("summary").click();
  await details.getByLabel("Request").selectOption(purpose);
  await details.getByLabel("Email address").fill(user.email);
  await details.getByRole("button", { name: "Send code" }).click();
  const field = details.getByLabel("Verification code");
  await field.waitFor();
  const mail = await codeFor(user.email, user.message);
  user.message = mail.id;
  await field.fill(mail.code);
  if (purpose === "register")
    await details.getByLabel("Username").fill(user.name);
  await details.getByLabel(/New password/).fill(user.password);
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(field).toHaveCount(0);
}
async function login(page, u) {
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Password", { exact: true }) })
    .first();
  await form.getByLabel("Username").fill(u.name);
  await form.getByLabel("Password", { exact: true }).fill(u.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
async function family(page) {
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.getByRole("link", { name: "Family", exact: true }).click();
}
try {
  const people = [];
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage();
    const name = fresh(),
      u = { name, email: name + "@example.test", password: fresh(), page };
    people.push(u);
    await accountPage(page);
    await challenge(page, u, "register");
    await login(page, u);
  }
  const [a, b] = people;
  const p = a.page,
    q = b.page;
  await p.getByRole("link", { name: "Water", exact: true }).click();
  await p.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await p.context().setOffline(true);
  await p.getByRole("button", { name: "Log water" }).click();
  await expect(
    p.getByText("Waiting to sync", { exact: true }).first(),
  ).toBeVisible();
  await p.context().setOffline(false);
  await p.getByRole("button", { name: "Sync now" }).click();
  await expect(p.getByRole("button", { name: /^Edit / })).toBeVisible({
    timeout,
  });
  await family(p);
  await p.getByLabel("Group name").fill("Fixture household");
  await p.getByRole("button", { name: "Create group" }).click();
  await p.getByLabel("Email address").fill(b.email);
  await p.getByRole("button", { name: "Invite to group" }).click();
  await expect(p.getByLabel("Email address")).toHaveValue("");
  await family(q);
  await q.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    q.getByRole("button", { name: "Share water totals with this member" }),
  ).toBeVisible();
  await p.reload();
  await p
    .getByRole("button", { name: "Share water totals with this member" })
    .click();
  await expect(
    p.getByRole("button", { name: "Stop sharing water" }),
  ).toBeVisible();
  await q.reload();
  await q.getByRole("button", { name: "Today's total" }).click();
  await expect(q.locator("output")).toContainText("250 mL");
  await p.getByRole("button", { name: "Stop sharing water" }).click();
  await expect(
    p.getByRole("button", { name: "Share water totals with this member" }),
  ).toBeVisible();
  await q.reload();
  await expect(
    q.getByRole("button", { name: "Share water totals with this member" }),
  ).toBeVisible();
  await expect(q.getByRole("button", { name: "Today's total" })).toHaveCount(0);
  const reset = await browser.newPage();
  await accountPage(reset);
  a.password = fresh();
  await challenge(reset, a, "reset");
  await login(reset, a);
  const old = await p.request.get(new URL("/api/v2/session", origin).href);
  assert.equal(old.status(), 401);
  console.log(
    "Passed browser registration, local mail verification, login, offline queue replay, invitation acceptance, owner grant, revocation and password reset with session invalidation.",
  );
} finally {
  await browser.close();
}
