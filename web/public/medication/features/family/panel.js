import { $, button, element, fitDialogToViewport } from "../../shared/ui/dom.js";
import { language, localDigits, t } from "../../shared/i18n/locale.js";
import { glassObject } from "../../design/three-dimensional.js";
import { profileName } from "../../domain/profile.js";
import { groupIconOf, groupIcons } from "../../domain/group-icons.js";
import { familySections } from "../../domain/family.js";
import { localWall, timezone } from "../../domain/wall-clock.js";
import { quantityFromText } from "../../domain/medication-rules.js";
import { familyRequest } from "./api.js";
import { field, profileFacts, sectionLabels, selectField } from "./fields.js";
import { avatar, sharedContext } from "./context.js";

const errors = { sign_in: "برای همکاری خانوادگی وارد حساب شوید.", offline: "برای دیدن سوابق خانواده به اینترنت وصل شوید.",
  expired: "این دعوت دیگر معتبر نیست.", forbidden: "این دسترسی فعال نیست.", missing: "این مورد دیگر در دسترس نیست.",
  already_recorded: "این نوبت قبلاً ثبت شده است.", conflict: "برای این ایمیل قبلاً دعوت فرستاده شده است.",
  care_too_large: "حجم سوابق از ظرفیت همگام‌سازی بیشتر است.", sync_required: "صاحب برنامه باید اول همگام‌سازی حساب را فعال کند.", limit: "سقف گروه یا دعوت‌ها پر شده است.", invalid: "اطلاعات واردشده را بررسی کنید." };
const inviteHash = /^#family-invite=([a-f0-9-]{36})$/;

function hero(title, subtitle, art = "control-user") {
  const box = element("div", "", "family-hero");
  const copy = element("div");
  copy.append(element("h3", title));
  if (subtitle) copy.append(element("p", subtitle, "quiet"));
  box.append(glassObject(art, "control"), copy);
  return box;
}

function icon(id, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  use.setAttribute("href", `#i-${id}`);
  svg.append(use);
  return svg;
}

function groupArt(value) {
  const art = element("span", "", "family-group-art");
  art.setAttribute("aria-hidden", "true");
  const design = groupIconOf(value);
  if (design === "group") art.append(icon("care-network", "care-network-glyph"));
  else art.append(glassObject(design, "control"));
  return art;
}

function groupBanner(title, caption, art) {
  const banner = element("div", "", "wizard-visual family-group-hero");
  const label = element("p");
  const name = element("strong", title);
  name.dir = "auto";
  label.append(element("small", t(caption)), name);
  banner.append(label, groupArt(art));
  return banner;
}

function submitButton(label, ...values) {
  const control = element("button", t(label, ...values), "block-action");
  control.type = "submit";
  return control;
}

const policyText = policy => [
  policy.sections.length === familySections.length ? t("ui.view-everything") : policy.sections.map(key => t(sectionLabels[key])).join(t("ui.and")),
  policy.record && t("ui.record-on-their-behalf"), policy.add && t("ui.add-a-schedule")
].filter(Boolean).join(" · ");

const groupPreference = "medora-family-active-group";
const actionArt = { medicine: "bottle", visit: "visit", routine: "routine" };
const clockFor = zone => new Date(localWall(Date.now(), timezone(zone))).toISOString().slice(11, 16);

export function installFamily({ openAccount, openProfile, getState, actionDay, getFamilyView, setFamilyView, openPlan }) {
  const dialog = $("family-dialog");
  const content = $("family-content");
  const quick = $("quick-dialog");
  const status = $("family-status");
  const back = $("family-back");
  const fit = fitDialogToViewport(dialog);
  let overview;
  let returnTo;
  let generation = 0;
  let accessTimer;
  let accessToken = 0;
  let activeGroup = sessionStorage.getItem(groupPreference);
  let currentAccess;
  let editorOperation;
  let recovery = false;
  let overviewRequest = 0;

  const personalName = () => getState()?.personalProfile?.firstName || overview?.label || t("ui.me");
  const groupInView = () => overview?.groups.find(item => item.id === activeGroup) ?? overview?.groups[0];
  function renderInboxBadge(invitations) {
    const count = invitations.length;
    const text = localDigits(count);
    $("care-inbox-count").textContent = text;
    $("open-care-inbox").setAttribute("aria-label", t("ui.value-pending-invitations", text));
    $("family-invite-count").textContent = text;
    $("family-invite-badge").setAttribute("aria-label", t("ui.value-pending-invitations", text));
    $("open-care-inbox").hidden = $("family-invite-badge").hidden = !count;
  }

  function updateGroup() {
    const group = groupInView();
    renderInboxBadge(overview?.invitations ?? []);
    const art = $("family-switch-art");
    const design = groupIconOf(group?.icon);
    if (art.dataset.icon !== design) {
      art.replaceChildren(...groupArt(design).children);
      art.dataset.icon = design;
    }
    $("family-group-name").textContent = group?.name ?? t("ui.care-groups");
    $("family-group-caption").textContent = t(group ? "گروه فعال" : "گروه‌ها و اعضا");
    $("family-group-avatars").replaceChildren(...(group?.members ?? []).filter(member => !member.self).slice(0, 3)
      .map(member => avatar(member.label, member.id)));
  }
  function chooseGroup(group) {
    activeGroup = group.id;
    sessionStorage.setItem(groupPreference, group.id);
    updateGroup();
  }
  let invite = inviteHash.exec(location.hash)?.[1];

  function message(value = "", error = false) {
    status.textContent = value ? t(value) : "";
    status.hidden = !value;
    status.toggleAttribute("data-error", error);
  }

  function page(title, parent) {
    generation++;
    returnTo = parent;
    back.hidden = !parent;
    $("family-mark").toggleAttribute("hidden", Boolean(parent));
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
  async function refreshGroup() {
    const request = ++overviewRequest;
    try {
      const next = await familyRequest();
      if (request === overviewRequest) {
        overview = next;
        updateGroup();
      }
    } catch (reason) {
      if (request === overviewRequest && reason.message === "sign_in") {
        overview = null;
        updateGroup();
        if (getFamilyView()) leave(t(errors.sign_in));
      }
      throw reason;
    }
  }

  async function refresh(groupId, show = showHome) {
    const request = generation;
    await refreshGroup();
    if (!dialog.open || request !== generation || !overview) return;
    const group = overview.groups.find(item => item.id === groupId);
    if (group) chooseGroup(group);
    if (group) show(group);
    else showHome();
  }

  function showHome() {
    page("گروه‌ها و اعضا");
    const selected = groupInView();
    if (selected) {
      content.append(groupBanner(selected.name, "گروه فعال", selected.icon));
      const groups = element("div", "", "family-group-tabs");
      groups.setAttribute("role", "group");
      groups.setAttribute("aria-label", t("ui.choose-active-group"));
      for (const group of overview.groups) {
        const control = button("", () => {
          chooseGroup(group);
          showHome();
          [...$("family-content").querySelectorAll(".family-group-tabs button")].find(item => item.dataset.group === group.id)?.focus();
        });
        control.append(element("span", group.name, "family-group-label"));
        control.dataset.group = group.id;
        const active = selected.id === group.id;
        control.setAttribute("aria-pressed", String(active));
        if (active) {
          control.append(icon("check"));
        }
        groups.append(control);
      }
      const roster = element("div", "", "family-roster");
      for (const member of [...selected.members].sort((a, b) => b.self - a.self)) {
        const label = member.self ? personalName() : member.label;
        const open = member.self ? () => { dialog.close(); leave(); } :
          member.received ? () => showCare(selected, member) : null;
        const row = open ? action("", open) : element("div");
        row.className = "family-roster-row";
        const copy = element("span", "", "family-context-copy");
        const caption = member.self ? t("ui.you") : !member.received ? t("ui.access-hasnt-been-shared") :
          member.received.record || member.received.add ? policyText(member.received) : t("ui.view-only");
        copy.append(element("strong", label), element("small", caption));
        row.append(avatar(label, member.id), copy);
        if (!member.self) {
          const access = element("span", "", "family-access-icon");
          access.append(icon(!member.received ? "lock" : member.received.record || member.received.add ? "pen" : "eye"));
          row.append(access);
        }
        if (open) row.append(icon("expand", "family-row-arrow"));
        roster.append(row);
      }
      content.append(groups, element("h3", t("ui.members"), "family-roster-title"), roster);
      groups.querySelector('[aria-pressed="true"]').scrollIntoView({ block: "nearest", inline: "nearest" });
    } else content.append(hero(t("ui.care-groups"), t("ui.create-a-group-or-accept-an-invitation-to-see-family-sche")));
    const controls = element("div", "", "family-group-links");
    const create = button(t("ui.create-group"), () => groupForm());
    create.prepend(icon("plus"));
    controls.append(create);
    if (selected) {
      const manage = button(t("ui.manage-group"), () => showGroup(selected));
      manage.prepend(icon("settings"));
      controls.append(manage);
    }
    const profile = button(t("ui.my-profile"), () => { dialog.close(); openProfile(); });
    profile.prepend(icon("user"));
    controls.append(profile);
    content.append(controls);
    if (overview.invitations.length) content.append(invitationList(showHome));
    if (invite) {
      const found = overview.invitations.find(item => item.id === invite);
      invite = null;
      history.replaceState(history.state, "", location.pathname + location.search);
      if (found) reviewInvite(found);
      else message("این دعوت دیگر معتبر نیست.", true);
    }
  }

  function invitationList(backTo) {
    const invitations = overview?.invitations ?? [];
    return section("دعوت‌های دریافتی", invitations.length ? invitations.map(item => {
      const card = element("article", "", "family-card");
      card.append(element("h4", item.name), element("p", t("ui.invited-by-value", item.inviter), "quiet"),
        button(t("ui.review-invitation"), () => reviewInvite(item, backTo)));
      return card;
    }) : [element("p", t("ui.no-new-invitations"), "quiet")]);
  }

  function showInbox() {
    page("دعوت‌های دریافتی", showHome);
    content.append(invitationList(showInbox));
  }

  function groupForm(group) {
    page(group ? "ویرایش گروه" : "ساخت گروه", group ? () => showGroup(group) : showHome);
    const form = element("form", "", "family-content family-compose sheet-form");
    const name = field("نام گروه", "name", "text", group?.name);
    const nameInput = name.querySelector("input");
    nameInput.maxLength = 60;
    nameInput.dir = "auto";
    nameInput.placeholder = t("ui.e-g-care-for-mom");
    const selectedIcon = groupIconOf(group?.icon);
    const banner = groupBanner(group?.name ?? t("ui.new-group"), "پیش‌نمایش", selectedIcon);
    const options = element("fieldset", "", "family-icon-options");
    options.append(element("legend", t("ui.group-icon")));
    const tiles = element("div", "", "family-icon-grid");
    for (const [id, label] of Object.entries(groupIcons)) {
      const tile = element("label");
      tile.title = t(label);
      const input = document.createElement("input");
      Object.assign(input, { type: "radio", name: "icon", value: id, checked: id === selectedIcon });
      input.setAttribute("aria-label", t(label));
      tile.append(input, groupArt(id));
      tiles.append(tile);
    }
    options.append(tiles);
    nameInput.addEventListener("input", () => {
      banner.querySelector("strong").textContent = nameInput.value.trim() || group?.name || t("ui.new-group");
    });
    options.addEventListener("change", event => banner.querySelector(".family-group-art").replaceWith(groupArt(event.target.value)));
    form.append(banner, name, options);
    if (!group) {
      const manager = profileName(getState()?.personalProfile) || overview.label;
      form.append(element("p", t("ui.group-manager-value", manager), "quiet"),
        element("p", t("ui.each-member-decides-what-to-share"), "quiet"));
    }
    form.append(submitButton(group ? "ذخیرهٔ تغییرات" : "ساخت گروه"));
    let created;
    formSubmit(form, async data => {
      const request = generation;
      const details = { name: data.get("name").trim(), icon: data.get("icon") };
      if (group) {
        await familyRequest("update-group", { group: group.id, ...details });
        if (dialog.open && request === generation) await refresh(group.id, updated => {
          showGroup(updated);
          message("تغییرات گروه ذخیره شد.");
        });
      } else {
        created ??= (await familyRequest("create", details)).group;
        if (dialog.open && request === generation) await refresh(created, afterCreate);
      }
    });
    content.append(form);
  }

  function afterCreate(group) {
    page("گروه ساخته شد", () => showGroup(group));
    const invite = button(t("ui.invite-members"), () => inviteMember(group));
    invite.className = "block-action";
    const later = button(t("ui.ill-do-this-later"), () => showGroup(group));
    later.className = "text-button block-action";
    content.append(groupBanner(group.name, "گروه فعال", group.icon),
      element("p", t("ui.invite-people-using-their-email-or-username"), "quiet"), invite, later);
  }

  function showGroup(group) {
    page("مدیریت گروه", showHome);
    content.append(groupBanner(group.name, "اعضای گروه", group.icon));
    const controls = element("div", "", "family-group-links");
    if (group.manager) {
      const edit = button(t("ui.edit-name-and-icon"), () => groupForm(group));
      edit.prepend(icon("pen"));
      const invite = button(t("ui.invite-a-member"), () => inviteMember(group));
      invite.prepend(icon("plus"));
      controls.append(edit, invite);
    }
    const reload = action("تازه‌کردن دسترسی‌ها", () => refresh(group.id, showGroup));
    reload.prepend(icon("refresh"));
    controls.append(reload);
    if (group.manager) {
      const remove = button(t("ui.delete-group"), () => confirmGroupDeletion(group));
      remove.classList.add("family-danger");
      controls.append(remove);
    }
    content.append(controls);
    const members = group.members.filter(member => !member.self);
    if (!members.length) {
      content.append(element("p", t("ui.no-other-members-have-joined-yet"), "quiet"));
      return;
    }
    if (members.length > 1) content.append(button(t("ui.share-with-all-current-members"), () => editGrant(group)));
    const given = [], received = [];
    for (const member of members) {
      const card = element("article", "", "family-card");
      card.append(element("h4", member.label), element("p", member.given ? policyText(member.given) : t("ui.access-not-granted"), "quiet"));
      const options = element("div", "", "buttons");
      options.append(button(t(member.given ? "مدیریت دسترسی" : "اعطای دسترسی"), () => editGrant(group, member)));
      if (member.given) {
        const revoke = button(t("ui.revoke-access"), () => confirmRevoke(group, member));
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
      [element("p", t("ui.no-members-are-sharing-records-with-you-yet"), "quiet")]),
    section("چه کسانی سوابقم را می‌بینند؟", given));
  }

  function confirmGroupDeletion(group) {
    const cancel = () => showGroup(group);
    page("حذف گروه", cancel);
    let deleted = false;
    const remove = action("حذف گروه", async () => {
      const request = generation;
      if (!deleted) {
        await familyRequest("delete-group", { group: group.id });
        deleted = true;
      }
      if (activeGroup === group.id) {
        activeGroup = null;
        sessionStorage.removeItem(groupPreference);
      }
      await refreshGroup();
      if (!dialog.open || request !== generation) return;
      showHome();
      message("گروه حذف شد.");
    });
    remove.classList.add("family-danger");
    content.append(groupBanner(group.name, "حذف گروه", group.icon),
      element("p", t("ui.deleting-this-group-removes-its-invitations-and-shared-pe")),
      button(t("ui.cancel"), cancel), remove);
  }

  function inviteMember(group) {
    page("دعوت به گروه", () => showGroup(group));
    const form = element("form", "", "family-content family-compose sheet-form");
    const address = field("ایمیل", "email", "email");
    Object.assign(address.querySelector("input"), { dir: "ltr", autocapitalize: "none", spellcheck: false, maxLength: 254, required: true });
    form.append(groupBanner(group.name, "دعوت به گروه", group.icon), address, submitButton("ارسال دعوت"));

    formSubmit(form, async data => {
      const request = generation;
      const email = String(data.get("email")).trim();
      const { delivered } = await familyRequest("invite", { group: group.id, email, language });
      if (!dialog.open || generation !== request) return;
      await refreshGroup();
      if (!dialog.open || generation !== request) return;
      const updated = overview?.groups.find(item => item.id === group.id);
      if (!updated) return;
      inviteMember(updated);
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
      row.append(element("h4", item.recipient ?? item.email), options);
      return row;
    })));
  }

  function reviewInvite(item, backTo = showHome) {
    page("دعوت به گروه", backTo);
    content.append(hero(item.name, t("ui.invited-by-value", item.inviter), "notification"),
      action("پذیرش عضویت", async () => {
        const { group } = await familyRequest("accept", { invite: item.id });
        await refresh(group);
        message("عضویت پذیرفته شد. اکنون می‌توانید دسترسی‌ها را انتخاب کنید.");
      }),
      action("رد دعوت", async () => { await familyRequest("decline", { invite: item.id }); await refresh(); }),
      element("p", t("ui.you-choose-whether-to-share-your-records"), "quiet"));
  }

  function editGrant(group, member) {
    page("دسترسی به سوابق من", () => showGroup(group));
    const form = $("family-share-template").content.firstElementChild.cloneNode(true);
    const existing = member?.given;
    form.querySelector("[data-recipient]").textContent = t("ui.share-with-value", member?.label ?? t("ui.all-current-members"));
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
      const original = new Option(t("ui.keep-current-expiry"), "keep", true, true);
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
      await refresh(group.id, showGroup);
      message(getState()?.accountCare?.enabled ? "دسترسی ذخیره شد." :
        "دسترسی ذخیره شد. برای دیدن سوابق این دستگاه، همگام‌سازی حساب را فعال کنید.");
    });
    content.append(form);
  }

  function confirmRevoke(group, member) {
    page("قطع دسترسی", () => showGroup(group));
    content.append(hero(t("ui.revoke-access-for-value", member.label), t("ui.they-will-remain-in-the-group")),
      element("p", t("ui.value-will-lose-access-to-your-records-through-this-group", member.label)),
      button(t("ui.cancel"), () => showGroup(group)));
    const revoke = action("قطع دسترسی", async () => {
      await familyRequest("revoke", { group: group.id, target: member.id });
      await refresh(group.id, showGroup);
      message("دسترسی قطع شد.");
    });
    revoke.classList.add("family-danger");
    content.append(revoke);
  }

  function openActionSheet(title, parent) {
    if (!dialog.open) dialog.showModal();
    page(title, parent);
    fit();
  }

  function closeFamilyEditors() {
    editorOperation = null;
    if (getFamilyView() && quick.open) quick.close();
    for (const editor of document.querySelectorAll("dialog[data-family-editor][open]")) editor.close();
  }

  function leave(feedback) {
    accessToken++;
    clearTimeout(accessTimer);
    currentAccess = null;
    closeFamilyEditors();
    if (getFamilyView() && dialog.open) dialog.close();
    if (getFamilyView()) setFamilyView(null, feedback);
  }

  function enter(group, member, data, feedback) {
    const view = sharedContext(data, group, member, {
      authorName: entry => {
        const personal = entry.recordedBy === overview?.label ? profileName(getState()?.personalProfile) : "";
        return personal || entry.recordedByName || entry.recordedBy;
      },
      record: details => {
        const view = getFamilyView();
        if (view?.member.id === member.id && view.group.id === group.id && view.canRecord(details.kind, details.day)) {
          if (details.kind === "water" || details.kind === "cycle") openFor(view, details.kind, details.day, "record");
          else recordFor(group, { ...member, label: view.name }, details);
        }
      },
      add: (kind, day) => {
        const view = getFamilyView();
        if (view?.member.id === member.id && view.group.id === group.id && view.canAdd(kind)) {
          openFor(view, kind, Math.max(day, view.today), "add");
        }
      },
      profile: () => {
        openActionSheet("پروفایل");
        const facts = profileFacts(data.records.profile);
        content.append(hero(getFamilyView().name, group.name));
        content.append(facts.childElementCount ? facts : element("p", t("ui.no-profile-information-has-been-added")));
      }
    });
    currentAccess = { group, member, data, day: view.today };
    setFamilyView(view, feedback);
  }

  async function showCare(group, member) {
    const request = generation;
    message("در حال ارتباط…");
    const data = await familyRequest("view", { group: group.id, target: member.id });
    if (!dialog.open || generation !== request) return;
    chooseGroup(group);
    dialog.close();
    accessToken++;
    enter(group, member, data);
    scheduleAccess();
    $("family-home").focus({ preventScroll: true });
  }

  function scheduleAccess() {
    clearTimeout(accessTimer);
    accessTimer = setTimeout(() => void checkAccess(), 15000);
  }

  async function checkAccess({ feedback, force = false } = {}) {
    if (!currentAccess) return;
    const { group, member, data, day } = currentAccess;
    const token = ++accessToken;
    clearTimeout(accessTimer);
    try {
      const latest = await familyRequest("view", { group: group.id, target: member.id,
        ...(!force && { knownPolicy: JSON.stringify(data.policy), knownRevision: data.revision }) });
      if (token !== accessToken) return;
      if (!latest.unchanged) {
        if (JSON.stringify(data.policy) !== JSON.stringify(latest.policy)) {
          if (dialog.open) dialog.close();
          closeFamilyEditors();
        }
        enter(group, member, latest, feedback);
      } else if (day !== getFamilyView()?.today) enter(group, member, data);
      scheduleAccess();
    } catch (reason) {
      if (token === accessToken) leave(t(errors[reason.message] ?? "ارتباط با خانواده برقرار نشد. دوباره تلاش کنید."));
    }
  }

  async function saved(feedback, view) {
    const current = getFamilyView();
    if (view.member.id !== current?.member.id || view.group.id !== current.group.id) return;
    if (dialog.open) dialog.close();
    await checkAccess({ feedback: t(feedback), force: true });
  }

  async function quickWater(view, day, amount, control) {
    if (!view.canRecord("water", day)) return;
    control.disabled = true;
    try {
      await familyRequest("record", { group: view.group.id, target: view.member.id, operation: crypto.randomUUID(),
        kind: "water", day, amount, time: clockFor(view.zone) });
      if (view.member.id === getFamilyView()?.member.id && view.group.id === getFamilyView()?.group.id) {
        await checkAccess({ feedback: t("ui.water-logged"), force: true });
      }
    } catch (reason) {
      if (view.member.id === getFamilyView()?.member.id && view.group.id === getFamilyView()?.group.id) {
        if (reason.message === "forbidden") leave(t(errors.forbidden));
        else {
          $("family-notice").textContent = t(errors[reason.message] ?? "ذخیره انجام نشد. دوباره تلاش کنید.");
          $("family-notice").hidden = false;
        }
      }
    } finally { control.disabled = false; }
  }

  function recordFor(group, member, details) {
    const { kind, day, title, routine } = details;
    const view = getFamilyView();
    openActionSheet(t("ui.record-for-value", member.label));
    const form = element("form", "", "family-content");
    form.append(hero(title, member.label, actionArt[kind]),
      element("p", t("ui.your-name-will-be-attached-to-the-entry"), "family-card"));
    if (kind === "medicine") {
      form.append(selectField("وضعیت مصرف", "status", [["taken", "دارو را دادم"], ["skipped", "مصرف نشد"]]));
      const dose = field("مقدار مصرف واقعی", "amount", "text",
        details.amount == null ? "" : details.amount / 1000);
      if (details.unit) dose.firstChild.textContent += " · " + details.unit;
      dose.querySelector("input").required = false;
      dose.querySelector("input").inputMode = "decimal";
      form.append(dose);
    }
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
    form.append(submitButton("ذخیره برای {0}", member.label));
    const operation = crypto.randomUUID();
    formSubmit(form, async data => {
      const entered = data.get("amount");
      const actual = kind === "medicine" && entered ? quantityFromText(entered) : undefined;
      if (kind === "medicine" && data.get("status") === "taken" && entered && !actual) throw new Error("invalid");
      await familyRequest("record", { group: group.id, target: member.id, operation, kind, day, id: details.id,
        minute: details.minute, status: data.get("status"), amount: actual,
        result: routine?.mode === "steps" ? data.getAll("step").map(Number) :
          routine?.mode === "quantity" ? Number(data.get("result")) : true });
      await saved("ثبت انجام شد.", view);
    });
    content.append(form);
  }

  function openFor(view, kind, day, action) {
    const { group, member } = view;
    const operation = crypto.randomUUID();
    if (dialog.open) dialog.close();
    editorOperation = operation;
    openPlan(kind, {
      name: view.name, day, zone: view.zone,
      ...(kind === "water" && { time: clockFor(view.zone) }),
      save: async values => {
        const current = getFamilyView();
        if (current?.group.id !== group.id || current.member.id !== member.id ||
            !(action === "record" ? current.canRecord(kind, values.day) : current.canAdd(kind))) {
          throw new Error(t(errors.forbidden));
        }
        try {
          const fields = action === "record" ? values : { plan: values };
          await familyRequest(action, { group: group.id, target: member.id, operation, kind, ...fields });
        } catch (reason) {
          if (reason.message === "forbidden" && editorOperation === operation) leave(t(errors.forbidden));
          throw new Error(t(errors[reason.message] ?? "ذخیره انجام نشد. دوباره تلاش کنید."));
        }
        if (editorOperation !== operation) return;
        closeFamilyEditors();
        await saved(action === "record" ? "ثبت انجام شد." : "برنامه اضافه شد.", view);
      }
    });
  }

  async function open() {
    if (!dialog.open) dialog.showModal();
    page("گروه‌ها و اعضا");
    fit();
    message("در حال ارتباط…");
    try { await refresh(); }
    catch (reason) {
      error(reason);
      if (reason.message === "sign_in") content.append(action("ورود به حساب مدورا", async () => {
        recovery = true;
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
    if (dialog.open) return;
    content.replaceChildren();
    returnTo = null;
  });
  async function refreshInbox() {
    if (!overview || document.hidden || !navigator.onLine) return;
    const previous = overview;
    try {
      const { invitations } = await familyRequest("inbox");
      if (previous !== overview) return;
      overview.invitations = invitations;
      renderInboxBadge(invitations);
    } catch (reason) {
      if (reason.message === "sign_in" && previous === overview) { overview = null; updateGroup(); }
    }
  }
  setInterval(() => void refreshInbox(), 30000);
  window.addEventListener("online", () => void refreshInbox());
  $("open-care-inbox").addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    showInbox();
    fit();
    const request = generation;
    void refreshInbox().then(() => { if (dialog.open && generation === request) showInbox(); });
  });
  $("open-family").addEventListener("click", () => void open());
  $("settings-open-family").addEventListener("click", () => {
    $("settings-dialog").close();
    void open();
  });
  $("family-home").addEventListener("click", () => {
    leave();
    const control = $("family-context").hidden || $("today-family-bottom").contains($("open-family")) ?
      document.querySelector('.app-bar [data-destination="settings"]') : $("open-family");
    control.focus({ preventScroll: true });
  });
  $("family-member-identity").addEventListener("click", () => getFamilyView()?.profile?.());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshInbox();
      if (getFamilyView()) void checkAccess();
    }
  });
  window.addEventListener("hashchange", () => {
    invite = inviteHash.exec(location.hash)?.[1];
    if (invite) void open();
  });
  window.addEventListener("offline", () => {
    if (getFamilyView()) leave(t(errors.offline));
    if (dialog.open) { page("گروه‌ها و اعضا"); message(errors.offline, true); content.append(action("تلاش دوباره", open)); }
  });
  return { leave, quickWater, refreshGroup: () => refreshGroup().catch(() => {}),
    openInvitation: () => {
      if (invite || recovery) void open();
      recovery = false;
    } };
}
