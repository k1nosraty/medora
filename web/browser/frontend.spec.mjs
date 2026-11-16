import { expect, test } from "@playwright/test";

async function open(page, { language = "fa", theme = "light", medicine = false, width = 390, height = 844 } = {}) {
  await page.setViewportSize({ width, height });
  await page.goto("/medication/");
  await expect(page.locator("#welcome-start")).toBeVisible();
  await page.evaluate(async ({ language, theme, medicine }) => {
    localStorage.setItem("medora-language", language);
    const { accessCare } = await import("/medication/shared/storage.js");
    const { today } = await import("/medication/shared/ui/dates.js");
    await accessCare(state => {
      state.intro = "done";
      state.theme = theme;
      if (medicine) state.medicines.sample = {
        id: "sample", name: "Sample tablet", unit: "قرص", stock: 15000, threshold: 2000,
        icon: "bottle", color: "purple", revision: 1,
        phases: [{ start: today(), end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 1000 }] }]
      };
    });
  }, { language, theme, medicine });
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
}

test("narrow English header fits including the invite badge", async ({ page }) => {
  await open(page, { language: "en", width: 320, height: 640 });
  const overflow = () => page.locator(".app-bar button:visible").evaluateAll(nodes => {
    const header = document.querySelector(".app-bar-inner").getBoundingClientRect();
    return nodes.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < header.left - .5 || rect.right > header.right + .5;
    }).map(node => node.id || node.getAttribute("aria-label") || node.textContent.trim());
  });
  await expect(page.getByRole("button", { name: "Update app", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "تغییر زبان به فارسی", exact: true })).toBeVisible();
  expect(await overflow()).toEqual([]);
  await page.context().addCookies([{ name: "test-family", value: "1", url: "http://127.0.0.1:8872" }]);
  await page.reload();
  await expect(page.locator("#open-care-inbox")).toBeVisible();
  for (const size of ["125%", "200%"]) {
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, size);
    expect(await overflow(), `Header controls at ${size} text size`).toEqual([]);
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
});

test("navigation keeps browser history, the selected day and keyboard focus", async ({ page }) => {
  await open(page);
  await page.locator("#next-day").click();
  const day = await page.locator("#day").inputValue();
  await page.locator(".program-card[data-destination=medications]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "medications");
  await expect(page.locator("#screen-title")).toBeFocused();
  await expect(page).toHaveURL(/view=medications/);
  await page.goBack();
  await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "today");
  await expect(page.locator("#day")).toHaveValue(day);
  await page.goForward();
  await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "medications");
});

test("refreshing local records keeps the selected day focused", async ({ page }) => {
  await open(page);
  const selected = page.locator("#day-week [aria-current=date]");
  await selected.focus();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(selected).toBeFocused();
  // A second request and an event loop pass allow the IndexedDB read to complete.
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare();
    await new Promise(requestAnimationFrame);
  });
  await expect(selected).toBeFocused();
});

test("Today’s cover follows local time and reacts to the selected accent", async ({ page }) => {
  const localTime = (hour, minute) => new Date(2026, 10, 15, hour, minute);
  await page.clock.install({ time: localTime(5, 58) });
  await page.clock.pauseAt(localTime(5, 59));
  await open(page);
  const cover = page.locator("#today-story");
  await expect(cover).toHaveAttribute("data-story-period", "night");
  await page.clock.runFor(60_000);
  await expect(cover).toHaveAttribute("data-story-period", "morning");
  await page.clock.setSystemTime(localTime(15, 0));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(cover).toHaveAttribute("data-story-period", "afternoon");
  await page.clock.setSystemTime(localTime(19, 0));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cover).toHaveAttribute("data-story-period", "night");
  const colors = () => cover.evaluate(node => ({
    background: getComputedStyle(node).backgroundColor,
    rim: getComputedStyle(node, "::after").borderTopColor
  }));
  const blue = await colors();
  await page.evaluate(() => { document.body.dataset.accent = "green"; });
  const green = await colors();
  expect(green.background).not.toBe(blue.background);
  expect(green.rim).toBe(blue.rim);
});

test("the next dose and its action fit the first mobile view", async ({ page }) => {
  await open(page, { medicine: true });
  const calendar = page.locator("#today-dates");
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate(node => {
    const top = node.getBoundingClientRect().top;
    return top < document.querySelector("#today-story").getBoundingClientRect().bottom &&
      top > document.querySelector(".story-copy").getBoundingClientRect().bottom;
  })).toBe(true);
  const action = page.locator("#today-focus .day-card-actions button").first();
  await expect(action).toBeVisible();
  expect(await action.evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector(".dock").getBoundingClientRect().top)).toBe(true);
});

test("daily plans and the cycle forecast use the same card slots", async ({ page }) => {
  await open(page, { medicine: true, width: 320 });
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    const { today } = await import("/medication/shared/ui/dates.js");
    const day = today();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await accessCare(state => {
      state.gender = "female";
      state.cycleEnabled = true;
      state.visits ??= {};
      state.visits.sample = { id: "sample", name: "Follow-up", day, time: "08:00", zone, category: "general", offsets: [] };
      state.routines ??= {};
      state.routines.sample = {
        id: "sample", name: "Walk", start: day, mask: 127, interval: 1, minute: 480, mode: "done", category: "walking", revision: 1
      };
    });
  });
  await page.reload();
  const cards = page.locator("#doses .day-card");
  await expect(cards).toHaveCount(3);
  for (const kind of ["medicine", "visit", "routine"]) {
    const card = cards.and(page.locator(`[data-card-kind="${kind}"]`));
    await expect(card.locator(":scope > .day-card-art > img")).toBeVisible();
    await expect(card.locator(".day-card-kind + .day-card-title + .day-card-time")).toHaveText("۰۸:۰۰");
    await expect(card.locator(":scope > .day-card-actions > button")).toBeVisible();
  }
  const banner = page.locator("#today-focus .day-card");
  const title = banner.locator(".day-card-title");
  const navigation = page.locator("#day-focus-navigation");
  const picker = navigation.locator(".day-focus-picker summary");
  await expect(title).toHaveText("Sample tablet");
  const featuredHeight = (await banner.boundingBox()).height;
  await expect(picker).toHaveText("۱ از ۳");
  await expect(banner.locator(".day-focus-status")).toBeVisible();
  expect(await navigation.evaluate(node => {
    const center = element => {
      const { top, height } = element.getBoundingClientRect();
      return top + height / 2;
    };
    return [...node.parentElement.children].every(element => Math.abs(center(element) - center(node)) < 1);
  })).toBe(true);
  await navigation.locator(".day-focus-next").click();
  await expect(title).toHaveText("Follow-up");
  await picker.click();
  await navigation.getByRole("button", { name: "Walk", exact: true }).click();
  await expect(title).toHaveText("Walk");
  await expect(picker).toBeFocused();
  await banner.locator(".day-card-title").evaluate(node => {
    for (const [type, x] of [["pointerdown", 150], ["pointermove", 75], ["pointerup", 75]]) {
      node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerType: "touch", pointerId: 1, isPrimary: true, clientX: x, clientY: 20
      }));
    }
  });
  await expect(title).toHaveText("Follow-up");
  await banner.locator(".care-record-action").click();
  await expect(title).toHaveText("Walk");
  await expect(picker).toHaveText("۲ از ۲");
  await banner.locator(".care-record-action").click();
  await expect(title).toHaveText("Sample tablet");
  await expect(picker).toHaveCount(0);
  expect((await banner.boundingBox()).height).toBe(featuredHeight);
  await page.locator("#program-cycle").click();
  const cycle = page.locator("#cycle-banner[data-card-kind=cycle]");
  await expect(cycle.locator(".day-card-kind + .day-card-title")).toBeVisible();
  await expect(cycle.locator(".day-card-details #cycle-forecast")).toBeVisible();
  await cycle.locator(".day-card-actions #cycle-add").click();
  await expect(page.locator("#cycle-dialog")).toBeVisible();
});

test("startup falls back to Persian when language storage access fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  await page.goto("/medication/");
  await expect(page.locator("#welcome-start")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
});

test("first launch reaches the app without a permission detour", async ({ page }) => {
  await page.goto("/medication/");
  await page.locator("#welcome-start").click();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#permission-screen")).toBeHidden();
  await page.locator("#today-focus [data-open-quick]").click();
  await expect(page.locator("#quick-dialog")).toBeVisible();
});

test("date picker has one tab stop, supports RTL arrows and restores focus on cancel", async ({ page }) => {
  await open(page);
  const opener = page.locator("#pick-day");
  const before = await page.locator("#day").inputValue();
  await opener.focus();
  await page.keyboard.press("Enter");
  const current = page.locator('#picker-days button[tabindex="0"]');
  await expect(current).toHaveCount(1);
  await expect(current).toBeFocused();
  const key = await current.getAttribute("data-focus-key");
  await page.keyboard.press("ArrowLeft");
  await expect(current).toBeFocused();
  await expect(current).not.toHaveAttribute("data-focus-key", key);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator("#day")).toHaveValue(before);
});

test("the medicine flow validates, preserves the draft and lets the user save", async ({ page }) => {
  await open(page, { width: 320, height: 640, theme: "dark" });
  await page.locator("#today-focus [data-open-quick]").click();
  await page.locator('#quick-dialog [data-open-medication]').click();
  await expect(page.locator("#editor-identity")).toBeFocused();
  await page.locator("#editor-next").click();
  await expect(page.locator("#name")).toBeFocused();
  await page.locator("#name").fill("Sample dose");
  await page.locator("#editor-next").click();
  await expect(page.locator("#editor-schedule")).toBeFocused();
  await page.locator("#editor-back").click();
  await expect(page.locator("#name")).toHaveValue("Sample dose");
  await page.locator("#editor-next").click();
  await page.locator("#editor-next").click();
  await expect(page.locator("#editor-confirm")).toBeFocused();
  await page.locator("#editor-next").click();
  await expect(page.locator("#medication-dialog")).toBeHidden();
  await expect(page.locator("#today-focus")).toContainText("Sample dose");
});

test("English profile and calendar remain usable on desktop", async ({ page }) => {
  await open(page, { language: "en", width: 1280, height: 900, theme: "dark", medicine: true });
  await page.locator(".header-tools [data-destination=settings]").click();
  await page.locator("[data-settings-panel=profile-settings]").click();
  await expect(page.locator("#settings-subtitle")).toHaveText("Personal information and cycle");
  await page.locator('[data-close="settings-dialog"]').click();
  await page.locator(".dock [data-destination=insights]").click();
  const date = page.locator('#calendar-days [tabindex="0"]');
  await expect(date).toHaveCount(1);
  const first = await date.getAttribute("data-focus-key");
  await date.focus();
  await page.keyboard.press("ArrowRight");
  await expect(date).not.toHaveAttribute("data-focus-key", first);
  await page.locator("[data-insight=reports]").click();
  await expect(page.locator("#reports-panel")).toBeVisible();
});

test("the installed shell shows and records data offline", async ({ page, context }) => {
  await open(page, { medicine: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/medication/assets/illustrations/today-scenes.webp")).ok)).toBe(true);
  await expect(page.locator("#today-focus")).toContainText("Sample tablet");
  await page.locator("#today-water-quick").click();
  await expect(page.locator("#today-water-feedback")).toBeVisible();
  await page.reload();
  await expect(page.locator("#today-water-total")).not.toHaveText("۰");
});

test("family entry controls respect view, record and add permissions", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8872";
  const group = "32100000-0000-4000-8000-000000000001";
  const target = "32100000-0000-4000-8000-000000000002";
  const setPolicy = value => context.addCookies([{ name: "test-family-policy", value, url: origin }]);
  const actions = async () => (await context.request.get(origin + "/__browser-test/actions")).json();
  await context.addCookies([{ name: "test-family", value: "1", url: origin }]);
  await setPolicy("read");
  await open(page, { language: "en" });
  async function selectMember() {
    await page.locator(".header-tools [data-destination=settings]").click();
    await page.locator("#settings-open-family").click();
    await page.locator(".family-roster-row").filter({ hasText: "Alex" }).click();
    await expect(page.locator("#family-home")).toBeVisible();
  }
  await selectMember();
  await expect(page.locator("#open-quick")).toBeHidden();
  await setPolicy("write");
  await page.locator("#family-home").click();
  await selectMember();
  await expect(page.locator("#open-quick")).toBeVisible();
  const count = (await actions()).length;
  await context.addCookies([{ name: "test-family-delay", value: crypto.randomUUID(), url: origin }]);
  await page.locator("#today-water-quick").click();
  await expect.poll(async () => (await actions()).length).toBe(count + 1);
  await expect(page.locator("#family-notice")).toBeVisible();
  await page.locator("#today-water-quick").click();
  await expect.poll(async () => (await actions()).length).toBe(count + 2);
  expect((await actions()).at(-1).operation).toEqual((await actions()).at(-2).operation);
  expect((await actions()).at(-1)).toMatchObject({ action: "record", target, group, kind: "water", amount: 250 });
  const personalWater = await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    return (await accessCare()).water;
  });
  expect(personalWater).toHaveLength(0);
  await page.locator("#open-quick").click();
  await page.locator('#quick-dialog [data-open-medication]').click();
  await expect(page.locator("#medication-dialog")).toHaveAttribute("data-family-editor", "");
  await setPolicy("revoked");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#medication-dialog")).toBeHidden();
  await expect(page.locator("#family-home")).toBeHidden();
  await setPolicy("write");
  await selectMember();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator("#family-home")).toBeHidden();
});

test("failed storage writes preserve records and repaint errors do not undo a commit", async ({ page }) => {
  await open(page, { language: "en" });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "days") {
        IDBObjectStore.prototype.put = put;
        throw new DOMException("Synthetic quota", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  const water = () => page.evaluate(async () => (await (await import("/medication/shared/storage.js")).accessCare()).water);
  await page.locator("#today-water-quick").click();
  await expect(page.locator("#status")).toHaveText(/Browser storage is full/);
  expect(await water()).toHaveLength(0);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "days") {
        IDBObjectStore.prototype.put = put;
        throw new Error("synthetic private storage diagnostic");
      }
      return put.apply(this, args);
    };
  });
  await page.locator("#today-water-quick").click();
  await expect(page.locator("#status")).toHaveText("Could not save. Try again.");
  expect(await water()).toHaveLength(0);

  await page.evaluate(() => {
    const paint = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...args) {
      if (this.closest("#app")) {
        Element.prototype.replaceChildren = paint;
        throw new Error("Synthetic view failure after commit");
      }
      return paint.apply(this, args);
    };
  });
  await page.locator("#today-water-quick").click();
  await expect(page.locator("#status")).toHaveText(/Records saved/);
  expect(await water()).toHaveLength(1);
});

test("a damaged or newer local database can be read for recovery without rewriting it", async ({ page }) => {
  await open(page, { language: "en" });
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare(state => { state.water = [{ id: "recovery", day: 20000, time: "10:00", amount: 250 }]; });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("medora-medication-prototype");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("care", "readwrite");
        transaction.objectStore("care").put({ revision: "damaged", settings: { reminders: { token: "synthetic" } } }, "state");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
    });
  });
  await page.reload();
  await expect(page.locator("#boot-status")).toContainText("could not be opened safely");
  await expect(page.locator("#boot-recovery")).toBeVisible();
  const recovery = async () => page.evaluate(async () => (await import("/medication/shared/storage.js")).readCareRecovery());
  expect((await recovery()).days[0].water[0].id).toBe("recovery");
  expect((await recovery()).care).toEqual({ revision: "damaged", settings: {} });
  await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("medora-medication-prototype", 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  }));
  await page.reload();
  await expect(page.locator("#boot-status")).toContainText("older version");
  expect((await recovery()).databaseVersion).toBe(4);
  expect((await recovery()).days[0].water[0].id).toBe("recovery");
});

test("notification deep links keep the requested date", async ({ page }) => {
  await open(page);
  const day = await page.locator("#day").inputValue();
  await page.goto(`/medication/?view=routines&day=${day}`);
  await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "routines");
  await expect(page.locator("#day")).toHaveValue(day);
  await page.locator("#screen-back").click();
  await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "today");
});

test("design gallery opens shared forms", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/design/?lang=en");
  await page.locator('[data-open-medication]').first().evaluate(button => button.click());
  await expect(page.locator("#medication-dialog")).toBeVisible();
  await page.locator('[data-close="medication-dialog"]').click();
  await page.locator('[data-open-visit]').first().evaluate(button => button.click());
  await expect(page.locator("#visit-dialog")).toBeVisible();
  expect(errors).toEqual([]);
});
