import { expect, test } from "./runner.mjs";
import { createHash } from "node:crypto";

test.use({ serviceWorkers: "block" });
test.skip(!process.env.MEDORA_PUBLIC_DIR, "Runs against the rebuilt product");

async function accessible(page, dialog) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const { violations } = await new AxeBuilder({ page })
    .include(dialog)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
}

async function product(page) {
  await page.goto("/medication/");
  await expect(page.locator("#welcome-start")).toBeVisible();
  await page.evaluate(async () => {
    localStorage.setItem("medora-language", "en");
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare((state) => {
      state.intro = "done";
    });
  });
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
}

test("React hosts preserve the product layout under the inline-style restriction", async ({
  page,
}) => {
  const styleViolations = [];
  await page.exposeFunction("recordStyleViolation", (target) => {
    styleViolations.push(target);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      if (!event.effectiveDirective.startsWith("style-src")) return;
      const target = event.target;
      // WebKit reports its own inline styling on native selects without a style attribute.
      if (target instanceof HTMLSelectElement && !target.hasAttribute("style"))
        return;
      void window.recordStyleViolation(target.id || target.nodeName);
    });
  });
  await product(page);
  for (const id of [
    "day-tools-react",
    "care-inbox-react",
    "account-react",
    "water-feedback-react",
    "today-timeline-react",
    "today-reminders-react",
    "cycle-feedback-react",
    "cycle-preparation-react",
    "cycle-tools-react",
    "cycle-settings-link-react",
  ]) {
    await expect(page.locator(`#${id}`)).toHaveCSS("display", "contents");
  }
  const stops = page.locator("#care-network-node stop");
  await expect(stops.nth(1)).toHaveCSS("stop-color", "rgb(234, 181, 247)");
  await expect(stops.nth(2)).toHaveCSS("stop-color", "rgb(76, 71, 187)");
  const dates = page.locator("#day-controls");
  const week = dates.locator("#day-week");
  await expect(week.getByRole("button")).toHaveCount(7);
  const weekBox = await week.boundingBox();
  expect(weekBox.width).toBeGreaterThan((await dates.boundingBox()).width / 2);
  for (const id of ["previous-day", "next-day"]) {
    const arrowBox = await dates.locator(`#${id}`).boundingBox();
    expect(arrowBox.y + arrowBox.height / 2).toBeGreaterThan(weekBox.y);
    expect(arrowBox.y + arrowBox.height / 2).toBeLessThan(weekBox.y + weekBox.height);
  }
  await page.locator('[data-destination="insights"]').click();
  await expect(page.locator("#insights-tab-host")).toHaveCSS("display", "contents");
  expect(styleViolations).toEqual([]);
});

test("React family groups, invitations and grants follow the existing action protocol", async ({
  page,
}) => {
  const invitation = {
    id: "f1952e93-d710-4eaf-9d35-023e380c6aa3",
    name: "Second household",
    inviter: "Test sender",
  };
  const member = { id: "member-test", label: "Test member" };
  const group = {
    id: "group-test",
    name: "",
    manager: true,
    icon: "group",
    members: [member],
    pending: [],
  };
  const groups = [];
  const invitations = [
    invitation,
    {
      ...invitation,
      id: "2ee08254-67c3-4fe7-a7c0-e1afad75ec97",
      name: "Declined household",
    },
  ];
  const actions = [];
  await page.route("**/api/family**", async (route) => {
    const action = route.request().postDataJSON();
    if (!action) {
      await route.fulfill({
        json: { groups, invitations, label: "Test account" },
      });
      return;
    }
    actions.push(action);
    switch (action.action) {
      case "create":
        group.name = action.name;
        groups.push(group);
        break;
      case "update-group":
        group.name = action.name;
        break;
      case "invite":
        group.pending.push({ id: "sent-test", recipient: action.email });
        break;
      case "cancel":
        group.pending.length = 0;
        break;
      case "share":
        member.given = {
          sections: action.sections,
          record: action.record,
          add: action.add,
        };
        break;
      case "revoke":
        delete member.given;
        break;
      case "accept":
        groups.push({
          id: "joined-test",
          name: invitation.name,
          manager: false,
          members: [],
          pending: [],
        });
        invitations.splice(
          invitations.findIndex((item) => item.id === action.invite),
          1,
        );
        await route.fulfill({ json: { group: "joined-test" } });
        return;
      case "decline":
        invitations.splice(
          invitations.findIndex((item) => item.id === action.invite),
          1,
        );
        break;
      case "delete-group":
        groups.splice(
          groups.findIndex((item) => item.id === action.group),
          1,
        );
        break;
      default:
        throw Error("Unexpected family action " + action.action);
    }
    await route.fulfill({ json: { group: group.id, delivered: false } });
  });

  await product(page);
  const family = page.locator("#family-dialog");
  const submit = family.locator('button[type="submit"]');
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#settings-open-family").click();
  await family.getByRole("button", { name: "Create group" }).click();
  await accessible(page, "#family-dialog");
  await family.locator("[name=name]").fill("Local household");
  await expect(family.locator(".family-group-hero strong")).toHaveText(
    "Local household",
  );
  await submit.click();
  await expect(
    family.getByRole("button", { name: "Invite members", exact: true }),
  ).toBeVisible();
  await expect(family.locator(".family-group-hero strong")).toHaveText(
    "Local household",
  );
  await family.locator("#family-back").click();

  await family.getByRole("button", { name: "Edit name and icon" }).click();
  await family.locator("[name=name]").fill("Updated household");
  await submit.click();
  await expect(family.locator(".family-group-hero strong")).toHaveText(
    "Updated household",
  );
  await family.getByRole("button", { name: "Invite a member" }).click();
  await family.locator("input[type=email]").fill("invite@example.test");
  await submit.click();
  const sent = family
    .locator(".family-card")
    .filter({ hasText: "invite@example.test" });
  await expect(sent).toBeVisible();
  await sent.locator("button").last().click();
  await expect(sent).toHaveCount(0);
  await family.locator("#family-back").click();

  await family
    .locator(".family-card")
    .filter({ hasText: "Test member" })
    .getByRole("button")
    .first()
    .click();
  await family.locator("[name=view][value=custom]").check();
  await family.locator("[name=section][value=cycle]").uncheck();
  await family.locator("[name=record]").check();
  await family.locator("[name=days]").selectOption("7");
  await submit.click();
  await expect(
    family
      .locator(".family-card")
      .filter({ hasText: "Test member" })
      .getByRole("button", { name: "Revoke access" }),
  ).toBeVisible();
  await family.getByRole("button", { name: "Revoke access" }).click();
  await family.locator(".family-danger").click();
  await expect(
    family.getByRole("button", { name: "Revoke access" }),
  ).toHaveCount(0);

  await family.getByRole("button", { name: "Delete group" }).click();
  await family.getByRole("button", { name: "Cancel" }).click();
  await expect(family.locator(".family-group-hero strong")).toHaveText(
    "Updated household",
  );
  await family.getByRole("button", { name: "Delete group" }).click();
  await family.locator(".family-danger").click();
  await expect(
    family.getByRole("button", { name: "Create group" }),
  ).toBeVisible();

  await family
    .locator(".family-card")
    .filter({ hasText: "Second household" })
    .getByRole("button")
    .click();
  await family.locator("#family-content .family-hero + button").click();
  await expect(family.locator(".family-group-hero strong")).toHaveText(
    "Second household",
  );
  await family
    .locator(".family-card")
    .filter({ hasText: "Declined household" })
    .getByRole("button")
    .click();
  await family.locator("#family-content button").last().click();
  await expect(
    family.getByRole("button", { name: "Create group" }),
  ).toBeVisible();
  await expect(
    family.locator(".family-card").filter({ hasText: "Declined household" }),
  ).toHaveCount(0);

  expect(actions.map((item) => item.action)).toEqual([
    "create",
    "update-group",
    "invite",
    "cancel",
    "share",
    "revoke",
    "delete-group",
    "accept",
    "decline",
  ]);
  expect(actions.find((item) => item.action === "share")).toMatchObject({
    group: group.id,
    target: member.id,
    all: false,
    record: true,
    add: false,
    days: 7,
  });
  expect(
    actions.find((item) => item.action === "share").sections,
  ).not.toContain("cycle");
});

const push = {
  endpoint: "https://push.example.test/local-fixture",
  keys: { p256dh: "test-key", auth: "test-auth" },
};
const token =
  createHash("sha256")
    .update(
      JSON.stringify([
        "medora-public-push",
        push.endpoint,
        push.keys.p256dh,
        push.keys.auth,
      ]),
    )
    .digest("hex")
    .slice(0, 32) + ".fixture";

test("React device settings distinguish permission, enrolment, schedule and delivery", async ({
  page,
}) => {
  await page.addInitScript((subscription) => {
    let permission = "denied";
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        get permission() {
          return permission;
        },
      },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    window.allowFixtureNotifications = () => {
      permission = "granted";
    };
    const register = navigator.serviceWorker.register.bind(
      navigator.serviceWorker,
    );
    let current = null;
    window.fixtureSubscriptionReads = 0;
    navigator.serviceWorker.register = (url, options) =>
      url === "/sw.js"
        ? Promise.resolve({
            active: {},
            pushManager: {
              getSubscription: async () => {
                window.fixtureSubscriptionReads++;
                return current;
              },
              subscribe: async () => {
                current = {
                  toJSON: () => subscription,
                  unsubscribe: async () => {
                    current = null;
                    return true;
                  },
                };
                return current;
              },
            },
          })
        : register(url, options);
  }, push);
  let config = false;
  const writes = [];
  let snapshot = { enabled: false, revision: 0 };
  await page.route("**/api/config", (route) =>
    route.fulfill({ status: config ? 200 : 503, json: { publicKey: "AQID" } }),
  );
  await page.route("**/api/reminders**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/enroll")) {
      expect(route.request().postDataJSON()).toEqual({ subscription: push });
      await route.fulfill({ json: { token } });
    } else if (path.endsWith("/test")) {
      await route.fulfill({ json: { status: "accepted" } });
    } else {
      if (route.request().method() === "PUT") {
        const change = route.request().postDataJSON();
        writes.push(change);
        snapshot = { enabled: change.enabled, revision: change.revision };
      }
      await route.fulfill({ json: snapshot });
    }
  });
  await product(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('[data-settings-panel="notification-settings"]').click();
  await expect(page.locator("#push-status")).toContainText(
    "Notification setup failed",
  );
  await expect(page.locator("#push-enable")).toBeDisabled();
  await accessible(page, "#settings-dialog");
  config = true;
  await page.locator("#push-check").click();
  await expect(page.locator("#push-status")).toContainText("device settings");
  expect(await page.evaluate(() => window.fixtureSubscriptionReads)).toBe(0);
  await page.locator("#push-enable").click();
  expect(writes).toHaveLength(0);
  await page.evaluate(() => window.allowFixtureNotifications());
  await page.locator("#push-enable").click();
  await expect(page.locator("#push-status")).toHaveText(
    "Notifications are on. Nothing is scheduled.",
  );
  expect(await page.evaluate(() => window.fixtureSubscriptionReads)).toBeGreaterThan(0);
  await page.locator("#push-show-details").check();
  await expect.poll(() => writes.length).toBe(2);
  await page.locator("#push-test").click();
  await expect(page.locator("#push-test-result")).toContainText("accepted");
  await page.locator("#push-disable").click();
  await expect(page.locator("#push-status")).toContainText("off");
  expect(writes.map((item) => item.enabled)).toEqual([true, true, false]);
});
