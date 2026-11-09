const enable = document.querySelector("#enable");
const reset = document.querySelector("#reset");
const sendNow = document.querySelector("#send-now");
const sendLater = document.querySelector("#send-later");
const check = document.querySelector("#check");
const code = document.querySelector("#code");
const permission = document.querySelector("#permission");
const result = document.querySelector("#result");

const deviceIsIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const testKey = "medora-pilot-last-test";
const clock = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const digits = new Intl.NumberFormat("fa-IR", { useGrouping: false });
const errors = {
  unauthorized: "کد آزمایش درست نیست.",
  pending: "یک آزمایش در صف است. بعد از پایان آن دوباره تلاش کنید.",
  rate_limit: "سهمیهٔ آزمایش این ساعت تمام شده است.",
  bad_subscription: "اشتراک این مرورگر برای آزمایش معتبر نیست.",
  not_found: "نتیجهٔ این آزمایش دیگر در دسترس نیست.",
  unconfigured: "سرور آزمایش هنوز آماده نیست."
};

let registration;
let subscription;
let applicationServerKey;
let busy = false;
let lastId;
let poll;
try {
  lastId = localStorage.getItem(testKey);
} catch {
  // A storage restriction only prevents recovering the previous test after reload.
}

function hasCode() {
  return /^[a-f0-9]{36}$/.test(code.value.trim());
}

function keyMatches() {
  const subscribedKey = subscription?.options?.applicationServerKey;
  return !subscribedKey || (subscribedKey.byteLength === applicationServerKey.length &&
    new Uint8Array(subscribedKey).every((byte, index) => byte === applicationServerKey[index]));
}

function refreshControls() {
  const valid = subscription && Notification.permission !== "denied" && keyMatches();
  enable.disabled = busy || !registration || Boolean(subscription) || Notification.permission === "denied";
  reset.hidden = !subscription;
  reset.disabled = busy;
  sendNow.disabled = sendLater.disabled = busy || !valid || !hasCode();
  check.disabled = busy || !lastId || !hasCode();
}

async function initialize() {
  if (deviceIsIOS && !installed) {
    permission.textContent = "برای فعال‌کردن اعلان روی آیفون، برنامه را از صفحهٔ اصلی باز کنید.";
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    permission.textContent = "اعلان وب در این مرورگر یا نسخهٔ سیستم‌عامل در دسترس نیست.";
    return;
  }
  try {
    const config = await fetch("/api/config");
    if (!config.ok) throw new Error();
    const { publicKey } = await config.json();
    applicationServerKey = Uint8Array.from(atob(publicKey.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
    await navigator.serviceWorker.register("/sw.js");
    const ready = await navigator.serviceWorker.ready;
    subscription = await ready.pushManager.getSubscription();
    registration = ready;
    showPermission();
    refreshControls();
  } catch {
    permission.textContent = "راه‌اندازی اعلان انجام نشد. اتصال اینترنت را بررسی و صفحه را دوباره باز کنید.";
  }
}

function showPermission() {
  if (Notification.permission === "denied") {
    permission.textContent = "مجوز اعلان بسته است. اعلان مدورا را در تنظیمات گوشی فعال کنید و دوباره برنامه را باز کنید.";
  } else if (subscription && !keyMatches()) {
    permission.textContent = "کلید سرور عوض شده است. اشتراک قبلی را لغو و اعلان را دوباره فعال کنید.";
  } else {
    permission.textContent = subscription ? "اعلان برای این نصب فعال است." : "برای دریافت اعلان، ابتدا آن را فعال کنید.";
  }
}

enable.addEventListener("click", async () => {
  busy = true;
  refreshControls();
  try {
    // Safari requires subscription to start directly in this user gesture.
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    showPermission();
  } catch {
    showPermission();
    if (Notification.permission !== "denied") permission.textContent = "فعال‌کردن اعلان کامل نشد. دوباره تلاش کنید.";
  } finally {
    busy = false;
    refreshControls();
  }
});

reset.addEventListener("click", async () => {
  busy = true;
  refreshControls();
  try {
    await subscription.unsubscribe();
    subscription = await registration.pushManager.getSubscription();
    showPermission();
  } catch {
    permission.textContent = "لغو اشتراک کامل نشد. دوباره تلاش کنید.";
  } finally {
    busy = false;
    refreshControls();
  }
});

async function request(path, data) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${code.value.trim()}` },
    body: JSON.stringify(data)
  });
  const output = await response.json();
  if (!response.ok) throw new Error(errors[output.error] ?? "درخواست آزمایش انجام نشد.");
  return output;
}

function showTest(test) {
  const time = clock.format(test.dueAt);
  if (test.status === "scheduled") {
    result.textContent = `ارسال برای ساعت ${time} ثبت شد. برای آزمون صفحهٔ قفل می‌توانید برنامه را ببندید.`;
    if (!document.hidden) poll = setTimeout(checkTest, 4000);
  } else if (test.status === "accepted") {
    result.textContent = `سرویس Push پیام را ساعت ${clock.format(test.finishedAt)} پذیرفت. نمایش اعلان را روی گوشی بررسی کنید.`;
  } else if (test.status === "gone") {
    result.textContent = "اشتراک قبلی دیگر معتبر نیست. اشتراک را لغو کنید و اعلان را دوباره فعال کنید.";
  } else if (test.status === "expired") {
    result.textContent = "زمان این آزمایش گذشته است. یک ارسال تازه ثبت کنید.";
  } else if (test.providerStatus) {
    result.textContent = `سرویس Push درخواست را رد کرد. کد پاسخ ${digits.format(test.providerStatus)}.`;
  } else {
    result.textContent = "ارتباط سرور با سرویس Push برقرار نشد.";
  }
}

async function startTest(delaySeconds) {
  clearTimeout(poll);
  busy = true;
  refreshControls();
  try {
    const test = await request("/api/test", { subscription: subscription.toJSON(), delaySeconds });
    lastId = test.id;
    try {
      localStorage.setItem(testKey, lastId);
    } catch {
      // The current test still works without storage.
    }
    showTest(test);
  } catch (error) {
    result.textContent = error instanceof TypeError ? "ارتباط با سرور آزمایش برقرار نشد." : error.message;
  } finally {
    busy = false;
    refreshControls();
  }
}

async function checkTest() {
  clearTimeout(poll);
  if (!lastId || !hasCode() || busy) return;
  busy = true;
  refreshControls();
  try {
    showTest(await request("/api/status", { id: lastId }));
  } catch (error) {
    result.textContent = error instanceof TypeError ? "ارتباط با سرور آزمایش برقرار نشد." : error.message;
  } finally {
    busy = false;
    refreshControls();
  }
}

code.addEventListener("input", refreshControls);
sendNow.addEventListener("click", () => startTest(0));
sendLater.addEventListener("click", () => startTest(60));
check.addEventListener("click", checkTest);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(poll);
  else if (registration) {
    showPermission();
    refreshControls();
    checkTest();
  }
});
initialize();
