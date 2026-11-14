import { $, button, element, fitDialogToViewport } from "../../shared/ui/dom.js";
import { language, t } from "../../shared/i18n/locale.js";
import { glassObject } from "../../design/three-dimensional.js";
import { familySections } from "../../domain/family.js";
import { isoDay } from "../../domain/care-index.js";
import { dayNumber } from "../../shared/ui/dates.js";
import { localClock } from "../../shared/ui/input-values.js";
import { quantityFromText } from "../../domain/medication-rules.js";
import { familyRequest } from "./api.js";
import { familyCareView, field, sectionLabels, selectField } from "./care-view.js";

const errors = { sign_in: "برای همکاری خانوادگی وارد حساب شوید.", offline: "برای دیدن سوابق خانواده به اینترنت وصل شوید.",
  expired: "این دعوت دیگر معتبر نیست.", forbidden: "این دسترسی فعال نیست.", missing: "این مورد دیگر در دسترس نیست.",
  already_recorded: "این نوبت قبلاً ثبت شده است.", conflict: "برای این ایمیل قبلاً دعوت فرستاده شده است.",
  sync_required: "صاحب برنامه باید اول همگام‌سازی حساب را فعال کند.", limit: "سقف گروه یا دعوت‌ها پر شده است.", invalid: "اطلاعات واردشده را بررسی کنید." };
const inviteHash = /^#family-invite=([a-f0-9-]{36})$/;

function hero(title, subtitle, art = "control-user") {
  const box = element("div", "", "family-hero");
  const copy = element("div");
  copy.append(element("h3", title));
  if (subtitle) copy.append(element("p", subtitle, "quiet"));
  box.append(glassObject(art, "control"), copy);
  return box;
}

function submitButton(label) {
  const control = element("button", t(label), "block-action");
  control.type = "submit";
  return control;
}

const policyText = policy => [
  policy.sections.length === familySections.length ? t("مشاهدهٔ همه") : policy.sections.map(key => t(sectionLabels[key])).join(t(" و ")),
  policy.record && t("ثبت به‌نمایندگی"), policy.add && t("افزودن برنامه")
].filter(Boolean).join(" · ");

export function installFamily({ openAccount, openProfile, getState }) {
  const dialog = $("family-dialog");
  const content = $("family-content");
  const status = $("family-status");
  const back = $("family-back");
  const fit = fitDialogToViewport(dialog);
  const updateLabel = () => { $("family-self-label").textContent = getState()?.personalProfile?.firstName || t("من"); };
  let overview;
  let returnTo;
  let generation = 0;
  let accessTimer;
  let invite = inviteHash.exec(location.hash)?.[1];

  function message(value = "", error = false) {
    status.textContent = value ? t(value) : "";
    status.hidden = !value;
    status.toggleAttribute("data-error", error);
  }

  function page(title, parent) {
    generation++;
    clearTimeout(accessTimer);
    returnTo = parent;
    back.hidden = !parent;
    $("family-title").textContent = t(title);
    content.replaceChildren();
    message();
    if (dialog.open) $("family-title").focus({ preventScroll: true });
  }

  function error(error) { message(errors[error.message] ?? "ارتباط با خانواده برقرار نشد. دوباره تلاش کنید.", true); }
  function formSubmit(form, work) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const control = event.submitter;
      if (control?.disabled) return;
      if (control) control.disabled = true;
      message();
      try { await work(new FormData(form)); }
      catch (reason) { error(reason); }
      finally { if (control) control.disabled = false; }
    });
  }
  function action(text, work) {
    const control = button(t(text), async () => {
      control.disabled = true;
      message();
      try { await work(); } catch (reason) { error(reason); }
      finally { control.disabled = false; }
    });
    return control;
  }
  function section(title, nodes) {
    const list = element("div", "", "family-list");
    list.append(element("h3", t(title)), ...nodes);
    return list;
  }
  async function refresh(groupId) {
    const request = generation;
    const next = await familyRequest();
    if (!dialog.open || request !== generation) return;
    overview = next;
    const group = overview.groups.find(item => item.id === groupId);
    if (group) showGroup(group);
    else showHome();
  }

  function showHome() {
    page("خانواده");
    content.append(hero(t("گروه‌های من")), button(t("ساخت گروه"), createGroup));
    const ownProfile = button(t("پروفایل من"), () => {
      dialog.close();
      openProfile();
    });
    content.append(ownProfile);
    for (const group of overview.groups) {
      const card = element("article", "", "family-card");
      card.append(element("h3", group.name), element("p", group.members.map(member => member.label).join(t(" و "))),
        button(t("باز کردن گروه"), () => showGroup(group)));
      content.append(card);
    }
    if (overview.invitations.length) content.append(section("دعوت‌های دریافتی", overview.invitations.map(item => {
      const card = element("article", "", "family-card");
      card.append(element("h4", item.name), button(t("بررسی دعوت"), () => reviewInvite(item)));
      return card;
    })));
    if (invite) {
      const found = overview.invitations.find(item => item.id === invite);
      invite = null;
      history.replaceState(history.state, "", location.pathname + location.search);
      if (found) reviewInvite(found);
      else message("این دعوت دیگر معتبر نیست.", true);
    }
  }

  function createGroup() {
    page("ساخت گروه", showHome);
    const form = element("form", "", "family-content");
    const name = field("نام گروه", "name", "text");
    name.querySelector("input").maxLength = 60;
    form.append(hero(t("خانواده")), name, element("p", t("مدیر گروه: {0}", overview.label), "family-card"),
      element("p", t("هر عضو دسترسی‌های خودش را تعیین می‌کند."), "quiet"), submitButton("ساخت گروه"));
    formSubmit(form, async data => {
      const result = await familyRequest("create", { name: data.get("name").trim() });
      await refresh(result.group);
    });
    content.append(form);
  }

  function showGroup(group) {
    page("دسترسی‌های من", showHome);
    content.append(hero(group.name, t("اعضای خانواده")));
    content.append(action("تازه‌کردن دسترسی‌ها", () => refresh(group.id)));
    if (group.manager) content.append(button(t("دعوت عضو"), () => inviteMember(group)));
    const members = group.members.filter(member => !member.self);
    if (!members.length) {
      content.append(element("p", t("هنوز عضو دیگری در این گروه نیست."), "quiet"));
      return;
    }
    if (members.length > 1) content.append(button(t("اشتراک با همهٔ اعضای فعلی"), () => editGrant(group)));
    const given = [], received = [];
    for (const member of members) {
      const card = element("article", "", "family-card");
      card.append(element("h4", member.label), element("p", member.given ? policyText(member.given) : t("دسترسی داده نشده"), "quiet"));
      const options = element("div", "", "buttons");
      options.append(button(t(member.given ? "مدیریت دسترسی" : "اعطای دسترسی"), () => editGrant(group, member)));
      if (member.given) {
        const revoke = button(t("قطع دسترسی"), () => confirmRevoke(group, member));
        revoke.classList.add("family-danger");
        options.append(revoke);
      }
      card.append(options);
      given.push(card);
      if (member.received) {
        const row = element("article", "", "family-card");
        row.append(element("h4", member.label), element("p", policyText(member.received), "quiet"),
          action("دیدن برنامه", () => showCare(group, member)));
        received.push(row);
      }
    }
    content.append(section("سوابقی که می‌بینم", received.length ? received :
      [element("p", t("اعضای گروه هنوز سابقه‌ای با شما به اشتراک نگذاشته‌اند."), "quiet")]),
    section("چه کسانی سوابقم را می‌بینند؟", given));
  }

  function inviteMember(group) {
    page("دعوت به گروه", () => showGroup(group));
    const form = element("form", "", "family-content");
    const email = field("ایمیل عضو", "email", "email");
    email.querySelector("input").dir = "ltr";
    form.append(hero(group.name, t("هر عضو دسترسی‌های خودش را تعیین می‌کند."), "notification"),
      email, submitButton("ارسال دعوت"));
    formSubmit(form, async data => {
      const { delivered } = await familyRequest("invite", { group: group.id, email: data.get("email"), language });
      const next = await familyRequest();
      overview = next;
      inviteMember(next.groups.find(item => item.id === group.id));
      message(delivered ? "دعوت با ایمیل فرستاده شد." : "دعوت ثبت شد. برای فرستادن، لینک دعوت را کپی کنید.");
    });
    content.append(form, section("دعوت‌های در انتظار", group.pending.map(item => {
      const row = element("article", "", "family-card");
      const options = element("div", "", "buttons");
      options.append(action("کپی لینک دعوت", async () => {
        const link = new URL(location.pathname, location.origin);
        link.hash = "family-invite=" + item.id;
        try {
          await navigator.clipboard.writeText(link.href);
          message("لینک دعوت کپی شد.");
        } catch {
          const input = field("لینک دعوت", "link", "url", link.href);
          input.querySelector("input").readOnly = true;
          row.append(input);
          input.querySelector("input").select();
        }
      }), action("لغو دعوت", async () => {
        await familyRequest("cancel", { invite: item.id });
        overview = await familyRequest();
        inviteMember(overview.groups.find(next => next.id === group.id));
      }));
      row.append(element("h4", item.email), options);
      return row;
    })));
  }

  function reviewInvite(item) {
    page("دعوت به گروه", showHome);
    content.append(hero(item.name, t("دعوت از {0}", item.inviter), "notification"),
      action("پذیرش عضویت", async () => {
        const { group } = await familyRequest("accept", { invite: item.id });
        await refresh(group);
        message("عضویت پذیرفته شد. اکنون می‌توانید دسترسی‌ها را انتخاب کنید.");
      }),
      action("رد دعوت", async () => { await familyRequest("decline", { invite: item.id }); await refresh(); }),
      element("p", t("اشتراک سوابق با انتخاب شماست."), "quiet"));
  }

  function editGrant(group, member) {
    page("دسترسی به سوابق من", () => showGroup(group));
    const form = $("family-share-template").content.firstElementChild.cloneNode(true);
    const existing = member?.given;
    form.querySelector("[data-recipient]").textContent = t("اشتراک با {0}", member?.label ?? t("همهٔ اعضای فعلی"));
    const sections = form.querySelector("[data-sections]");
    for (const key of familySections) {
      const label = element("label", t(sectionLabels[key]));
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "section";
      input.value = key;
      input.checked = existing?.sections.includes(key) ?? true;
      label.prepend(input);
      sections.append(label);
    }
    form.elements.view.value = existing && existing.sections.length !== familySections.length ? "custom" : "all";
    form.elements.record.checked = Boolean(existing?.record);
    form.elements.add.checked = Boolean(existing?.add);
    if (member?.givenExpires) {
      const original = new Option(t("حفظ تاریخ انقضای فعلی"), "keep", true, true);
      form.elements.days.prepend(original);
      form.elements.days.value = "keep";
    }
    const sync = () => {
      sections.hidden = form.elements.view.value !== "custom";
      form.querySelector("[data-scope]").hidden = !sections.hidden;
    };
    form.elements.view.forEach(control => control.addEventListener("change", sync));
    sync();
    formSubmit(form, async data => {
      await familyRequest("share", { group: group.id, target: member?.id ?? "all", all: data.get("view") === "all",
        sections: data.getAll("section"), record: data.has("record"), add: data.has("add"),
        days: data.get("days") === "keep" ? "keep" : Number(data.get("days")) || null });
      await refresh(group.id);
      message(getState()?.accountCare?.enabled ? "دسترسی ذخیره شد." :
        "دسترسی ذخیره شد. برای دیدن سوابق این دستگاه، همگام‌سازی حساب را فعال کنید.");
    });
    content.append(form);
  }

  function confirmRevoke(group, member) {
    page("قطع دسترسی", () => showGroup(group));
    content.append(hero(t("قطع دسترسی {0}؟", member.label), t("عضویت در گروه برقرار می‌ماند.")),
      element("p", t("{0} دیگر از این گروه به سوابق شما دسترسی ندارد.", member.label)),
      button(t("انصراف"), () => showGroup(group)));
    const revoke = action("قطع دسترسی", async () => {
      await familyRequest("revoke", { group: group.id, target: member.id });
      await refresh(group.id);
      message("دسترسی قطع شد.");
    });
    revoke.classList.add("family-danger");
    content.append(revoke);
  }

  async function showCare(group, member, day) {
    page("برنامهٔ عضو خانواده", () => showGroup(group));
    const request = generation;
    message("در حال ارتباط…");
    try {
      const data = await familyRequest("view", { group: group.id, target: member.id });
      if (!dialog.open || request !== generation) return;
      message();
      renderCare(group, member, data, day);
      return true;
    } catch (reason) {
      if (request === generation) error(reason);
    }
  }

  function renderCare(group, member, data, day) {
    const fullName = [data.records.profile?.firstName, data.records.profile?.lastName].filter(Boolean).join(" ");
    content.replaceChildren(hero(t("برنامهٔ {0}", fullName || member.label), group.name));
    familyCareView(content, data, { day, changeDay: day => renderCare(group, member, data, day),
      record: record => recordFor(group, member, record), add: (changes, day) => addFor(group, member, changes, day) });
    const request = ++generation;
    clearTimeout(accessTimer);
    const checkAccess = async () => {
      try {
        const latest = await familyRequest("view", { group: group.id, target: member.id,
          knownPolicy: JSON.stringify(data.policy), knownRevision: data.revision });
        if (!dialog.open || generation !== request) return;
        if (!latest.unchanged) renderCare(group, member, latest, day);
        else accessTimer = setTimeout(checkAccess, 15000);
      } catch (reason) {
        if (generation !== request) return;
        content.replaceChildren();
        error(reason);
      }
    };
    accessTimer = setTimeout(checkAccess, 15000);
  }

  function recordFor(group, member, details) {
    const { kind, day, title, routine } = details;
    page("ثبت به‌نمایندگی", () => void showCare(group, member, day));
    const form = element("form", "", "family-content");
    form.append(hero(t("ثبت برای {0}", member.label), title, "bottle"),
      element("p", t("به نام شما ثبت می‌شود."), "family-card"));
    if (kind === "medicine") {
      form.append(selectField("وضعیت مصرف", "status", [["taken", "دارو را دادم"], ["skipped", "مصرف نشد"]]));
      const dose = field("مقدار مصرف واقعی", "amount", "text",
        details.amount == null ? "" : details.amount / 1000);
      if (details.unit) dose.firstChild.textContent += " · " + details.unit;
      dose.querySelector("input").required = false;
      dose.querySelector("input").inputMode = "decimal";
      form.append(dose);
    }
    if (kind === "water") form.append(field("آب (میلی‌لیتر)", "amount", "number", 250), field("ساعت", "time", "time", localClock()));
    if (kind === "routine" && routine.mode === "quantity") form.append(field("مقدار انجام‌شده", "result", "number", routine.amount ?? routine.target));
    if (kind === "routine" && routine.mode === "steps") {
      for (const [index, step] of routine.steps.entries()) {
        const label = element("label", step);
        const check = document.createElement("input");
        check.type = "checkbox";
        check.name = "step";
        check.value = index;
        check.checked = routine.checked?.includes(index) ?? false;
        label.prepend(check);
        form.append(label);
      }
    }
    if (kind === "cycle") {
      const end = field("تاریخ پایان", "end", "date");
      end.querySelector("input").required = false;
      const note = field("یادداشت", "note", "text");
      note.querySelector("input").required = false;
      note.querySelector("input").maxLength = 500;
      form.append(end, selectField("شدت", "flow", [["", "انتخاب نشده"], ["light", "کم"], ["medium", "متوسط"], ["heavy", "زیاد"]]), note);
    }
    form.append(submitButton("تأیید ثبت"));
    const operation = crypto.randomUUID();
    formSubmit(form, async data => {
      const entered = data.get("amount");
      const actual = kind === "medicine" && entered ? quantityFromText(entered) : undefined;
      if (kind === "medicine" && data.get("status") === "taken" && entered && !actual) throw new Error("invalid");
      await familyRequest("record", { group: group.id, target: member.id, operation, kind, day, id: details.id,
        minute: details.minute, time: data.get("time"), status: data.get("status"),
        amount: kind === "water" ? Number(entered) : actual,
        result: routine?.mode === "steps" ? data.getAll("step").map(Number) :
          routine?.mode === "quantity" ? Number(data.get("result")) : true,
        ...(kind === "cycle" && { end: data.get("end") ? dayNumber(data.get("end")) : null, flow: data.get("flow"), note: data.get("note") }) });
      if (await showCare(group, member, day)) message("ثبت انجام شد.");
    });
    content.append(form);
  }

  function addFor(group, member, changes, day) {
    page("افزودن برنامه", () => void showCare(group, member, day));
    const form = element("form", "", "family-content");
    const medication = element("div", "", "family-content");
    medication.append(field("مقدار برنامه", "amount", "text"), field("واحد", "unit", "text", t("قرص")),
      selectField("تکرار", "repeat", [["once", "یک‌بار"], ["daily", "هر روز"]]));
    form.append(hero(t("افزودن برای {0}", member.label)), selectField("نوع برنامه", "kind", changes),
      field("نام", "name", "text"), field("تاریخ برنامه", "day", "date", isoDay(day)), field("ساعت", "time", "time", "08:00"),
      medication, submitButton("ذخیرهٔ برنامه"));
    function sync() {
      medication.hidden = form.elements.kind.value !== "medicine";
      for (const input of medication.querySelectorAll("input,select")) input.disabled = medication.hidden;
    }
    form.elements.kind.addEventListener("change", sync);
    sync();
    const operation = crypto.randomUUID();
    formSubmit(form, async data => {
      await familyRequest("add", { group: group.id, target: member.id, operation,
        kind: data.get("kind"), name: data.get("name"), day: dayNumber(data.get("day")), time: data.get("time"),
        amount: data.has("amount") ? quantityFromText(data.get("amount")) : undefined, unit: data.get("unit"), repeat: data.get("repeat") });
      if (await showCare(group, member, day)) message("برنامه اضافه شد.");
    });
    content.append(form);
  }

  async function open() {
    if (!dialog.open) dialog.showModal();
    page("خانواده");
    fit();
    message("در حال ارتباط…");
    try { await refresh(); }
    catch (reason) {
      error(reason);
      if (reason.message === "sign_in") content.append(action("ورود به حساب مدورا", async () => {
        dialog.close();
        await openAccount();
      }));
      else content.append(action("تلاش دوباره", open));
    }
  }

  back.addEventListener("click", () => returnTo?.());
  dialog.addEventListener("cancel", event => {
    if (!returnTo) return;
    event.preventDefault();
    returnTo();
  });
  dialog.addEventListener("close", () => {
    generation++;
    clearTimeout(accessTimer);
    content.replaceChildren();
    returnTo = null;
  });
  $("open-family").addEventListener("click", () => void open());
  window.addEventListener("hashchange", () => {
    invite = inviteHash.exec(location.hash)?.[1];
    if (invite) void open();
  });
  window.addEventListener("offline", () => {
    if (dialog.open) { page("خانواده"); message(errors.offline, true); content.append(action("تلاش دوباره", open)); }
  });
  return { updateLabel, openInvitation: () => { if (invite) void open(); } };
}
