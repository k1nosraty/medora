import { useLayoutEffect, useRef, type ReactNode } from "react";
import { watchFamilyAccess } from "../../../product-assets/public/medication/features/family/access.js";
import { familyRequest } from "../../../product-assets/public/medication/features/family/api.js";
import { sharedContext } from "../../../product-assets/public/medication/features/family/projection.js";
import { profileName } from "@medora/domain/browser/profile";
import { fitDialogToViewport } from "../../../product-assets/public/medication/shared/ui/dom.js";
import {
  language,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { FamilyDoseForm } from "../medication/FamilyDoseForm";
import { installDelegatedCare, sameOwner, type OpenFamilyPlan } from "./delegatedCare";
import { pollFamilyView, readFamilyView, type SharedCare } from "./familyApi";
import { Icon } from "../PlanCard";
import type { CareState, FamilyView } from "../productState";
import { paintFeature } from "../renderer";
import {
  Avatar,
  FamilyAction,
  FamilyContext,
  FamilyForm,
  FamilyHero,
  FamilySection,
  GrantForm,
  GroupBanner,
  GroupForm,
  InboxBadge,
  InvitationLink,
  policyText,
  ProfileFacts,
  type Group,
  type Invitation,
  type Member,
  type Overview,
  type Run,
} from "./FamilyViews";

const errors: Record<string, string> = {
  sign_in: "برای همکاری خانوادگی وارد حساب شوید.",
  offline: "برای دیدن سوابق خانواده به اینترنت وصل شوید.",
  expired: "این دعوت دیگر معتبر نیست.",
  forbidden: "این دسترسی فعال نیست.",
  missing: "این مورد دیگر در دسترس نیست.",
  already_recorded: "این نوبت قبلاً ثبت شده است.",
  conflict: "برای این ایمیل قبلاً دعوت فرستاده شده است.",
  care_too_large: "حجم سوابق از ظرفیت همگام‌سازی بیشتر است.",
  sync_required: "صاحب برنامه باید اول همگام‌سازی حساب را فعال کند.",
  limit: "سقف گروه یا دعوت‌ها پر شده است.",
  invalid: "اطلاعات واردشده را بررسی کنید.",
};
const unavailable = "ارتباط با خانواده برقرار نشد. دوباره تلاش کنید.";
const saveFailure = "ذخیره انجام نشد. دوباره تلاش کنید.";
const inviteHash = /^#family-invite=([a-f0-9-]{36})$/;
const groupPreference = "medora-family-active-group";
const reason = (value: unknown) =>
  value instanceof Error ? value.message : "unavailable";
const $ = (id: string) => document.getElementById(id)!;

type Kind = Parameters<FamilyView["canRecord"]>[0];
type Delegated = Extract<Parameters<FamilyView["record"]>[0], { id: string }>;
interface Options {
  openAccount(): Promise<void>;
  openProfile(): void;
  getState(): CareState | undefined;
  getFamilyView(): FamilyView | null;
  setFamilyView(view: FamilyView | null, feedback?: string): void;
  openPlan: OpenFamilyPlan;
}
type Page = {
  title: string;
  content?: ReactNode;
  parent?: (() => void) | undefined;
};
type Feedback = { message: string; error: boolean };

function FamilySheet({
  dialog,
  screen,
  generation,
  feedback,
}: {
  dialog: HTMLDialogElement;
  screen: Page;
  generation: number;
  feedback: Feedback;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (dialog.open) heading.current?.focus({ preventScroll: true });
  }, [dialog, generation]);
  return (
    <>
      <div className="sheet-header">
        {!screen.parent && (
          <svg id="family-mark" aria-hidden="true">
            <use href="#i-mark" />
          </svg>
        )}
        <button
          id="family-back"
          className="icon-button"
          type="button"
          aria-label={t("ui.back")}
          hidden={!screen.parent}
          onClick={screen.parent}
        >
          <Icon name="back" />
        </button>
        <h2 id="family-title" tabIndex={-1} ref={heading}>
          {t(screen.title)}
        </h2>
        <button
          className="icon-button"
          type="button"
          data-close="family-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body family-body">
        <p
          id="family-status"
          role="status"
          data-state={feedback.error ? "error" : undefined}
          hidden={!feedback.message}
        >
          {feedback.message}
        </p>
        <div id="family-content" className="family-content" key={generation}>
          {screen.content}
        </div>
      </div>
    </>
  );
}

export function installFamilyDialog({
  openAccount,
  openProfile,
  getState,
  getFamilyView,
  setFamilyView,
  openPlan,
}: Options) {
  const dialog = $("family-dialog") as HTMLDialogElement;
  const quick = $("quick-dialog") as HTMLDialogElement;
  const fit = fitDialogToViewport(dialog);
  let screen: Page = { title: "ui.care-groups" };
  let feedback: Feedback = { message: "", error: false };
  let generation = 0;
  let overview: Overview | null = null;
  let overviewRequest = 0;
  let recovery = false;
  let invite = inviteHash.exec(location.hash)?.[1];
  let storage: Storage | undefined;
  let activeGroup: string | null | undefined;
  try {
    storage = sessionStorage;
    activeGroup = storage.getItem(groupPreference);
  } catch {
    storage = undefined;
  }
  const groupInView = () =>
    overview?.groups.find((group) => group.id === activeGroup) ??
    overview?.groups[0];
  const personalName = () =>
    getState()?.personalProfile?.firstName || overview?.label || t("ui.me");
  const active = (request: number) => dialog.open && request === generation;
  const access = watchFamilyAccess({
    request: pollFamilyView,
    today: () => getFamilyView()?.today,
    denied: (error: unknown) => leave(t(errors[reason(error)] ?? unavailable)),
    changed: (
      group: Group,
      member: Member,
      data: SharedCare,
      notice: string | undefined,
      policyChanged: boolean,
    ) => {
      if (policyChanged) {
        if (dialog.open) dialog.close();
        closeFamilyEditors();
      }
      enter(group, member, data, notice);
    },
  });

  const delegated = installDelegatedCare({
    storage,
    getFamilyView,
    openPlan,
    closeDialog: () => { if (dialog.open) dialog.close(); },
    closeEditors: closeFamilyEditors,
    onSaved: saved,
    onForbidden: () => leave(t(errors.forbidden)),
    errorMessage: (error) => t(errors[reason(error)] ?? saveFailure),
  });

  function paint() {
    paintFeature(
      dialog,
      <FamilySheet
        dialog={dialog}
        screen={screen}
        generation={generation}
        feedback={feedback}
      />,
    );
  }
  function paintContext() {
    const view = getFamilyView();
    const count = overview?.invitations.length ?? 0;
    $("app").toggleAttribute("data-family-member", Boolean(view));
    paintFeature(
      $("family-context"),
      <FamilyContext
        group={groupInView()}
        count={count}
        view={view}
        open={() => void open()}
        leave={() => {
          leave();
          const button =
            $("family-context").hidden ||
            $("today-family-bottom").contains($("open-family"))
              ? document.querySelector<HTMLElement>(
                  '.app-bar [data-destination="settings"]',
                )
              : $("open-family");
          button?.focus({ preventScroll: true });
        }}
      />,
    );
    paintFeature(
      $("care-inbox-react"),
      <InboxBadge count={count} open={openInbox} />,
    );
  }
  function message(value = "", error = false) {
    feedback = { message: value ? t(value) : "", error };
    paint();
  }
  function page(title: string, content: ReactNode, parent?: () => void) {
    generation++;
    screen = { title, parent, content };
    feedback = { message: "", error: false };
    paint();
  }
  function chooseGroup(group: Group) {
    activeGroup = group.id;
    try {
      storage?.setItem(groupPreference, group.id);
    } catch {
      storage = undefined;
    }
    paintContext();
  }
  const run: Run = async (work) => {
    const request = generation;
    message();
    try {
      await work();
    } catch (error) {
      if (active(request)) message(errors[reason(error)] ?? unavailable, true);
    }
  };

  async function refreshGroup() {
    const request = ++overviewRequest;
    try {
      const next: Overview = await familyRequest();
      if (request === overviewRequest) {
        overview = next;
        paintContext();
      }
    } catch (error) {
      if (request === overviewRequest && reason(error) === "sign_in") {
        overview = null;
        paintContext();
        if (getFamilyView()) leave(t(errors.sign_in));
      }
      throw error;
    }
  }

  async function refresh(
    id?: string,
    show: (group: Group) => void = () => showHome(),
  ) {
    const request = generation;
    await refreshGroup();
    if (!active(request) || !overview) return false;
    const group = overview.groups.find((item) => item.id === id);
    if (group) {
      chooseGroup(group);
      show(group);
    } else showHome();
    return true;
  }

  function invitations(back: () => void) {
    const rows = overview?.invitations ?? [];
    return (
      <FamilySection title="دعوت‌های دریافتی">
        {rows.length ? (
          rows.map((item) => (
            <article className="family-card" key={item.id}>
              <h4>{item.name}</h4>
              <p className="quiet">{t("ui.invited-by-value", item.inviter)}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => reviewInvite(item, back)}
              >
                {t("ui.review-invitation")}
              </button>
            </article>
          ))
        ) : (
          <p className="quiet">{t("ui.no-new-invitations")}</p>
        )}
      </FamilySection>
    );
  }

  function showHome() {
    const selected = groupInView();
    page(
      "گروه‌ها و اعضا",
      <>
        {selected ? (
          <>
            <GroupBanner
              name={selected.name}
              icon={selected.icon}
              caption="گروه فعال"
            />
            <div
              className="family-group-tabs"
              role="group"
              aria-label={t("ui.choose-active-group")}
            >
              {overview?.groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="secondary"
                  data-group={group.id}
                  aria-pressed={group.id === selected.id}
                  onClick={() => {
                    chooseGroup(group);
                    showHome();
                    Array.from(
                      dialog.querySelectorAll<HTMLButtonElement>(
                        ".family-group-tabs button",
                      ),
                    )
                      .find((button) => button.dataset.group === group.id)
                      ?.focus();
                  }}
                >
                  <span className="family-group-label">{group.name}</span>
                  {group.id === selected.id && <Icon name="check" />}
                </button>
              ))}
            </div>
            <h3 className="family-roster-title">{t("ui.members")}</h3>
            <div className="family-roster">
              {[...selected.members]
                .sort(
                  (a, b) => Number(Boolean(b.self)) - Number(Boolean(a.self)),
                )
                .map((member) => {
                  const label = member.self ? personalName() : member.label;
                  const launch = member.self
                    ? () => {
                        dialog.close();
                        leave();
                      }
                    : member.received
                      ? () => showCare(selected, member)
                      : undefined;
                  const canWrite =
                    member.received?.record || member.received?.add;
                  const caption = member.self
                    ? t("ui.you")
                    : !member.received
                      ? t("ui.access-hasnt-been-shared")
                      : canWrite
                        ? policyText(member.received)
                        : t("ui.view-only");
                  const details = (
                    <>
                      <Avatar label={label} id={member.id} />
                      <span className="family-context-copy">
                        <strong>{label}</strong>
                        <small>{caption}</small>
                      </span>
                      {!member.self && (
                        <span className="family-access-icon">
                          <Icon
                            name={
                              !member.received
                                ? "lock"
                                : canWrite
                                  ? "pen"
                                  : "eye"
                            }
                          />
                        </span>
                      )}
                      {launch && (
                        <svg className="family-row-arrow" aria-hidden="true">
                          <use href="#i-expand" />
                        </svg>
                      )}
                    </>
                  );
                  return launch ? (
                    <FamilyAction
                      key={member.id}
                      className="family-roster-row"
                      run={run}
                      work={launch}
                    >
                      {details}
                    </FamilyAction>
                  ) : (
                    <div className="family-roster-row" key={member.id}>
                      {details}
                    </div>
                  );
                })}
            </div>
          </>
        ) : (
          <FamilyHero
            title={t("ui.care-groups")}
            subtitle={t(
              "ui.create-a-group-or-accept-an-invitation-to-see-family-sche",
            )}
          />
        )}
        <div className="family-group-links">
          <button
            type="button"
            className="secondary"
            onClick={() => groupEditor()}
          >
            <Icon name="plus" />
            {t("ui.create-group")}
          </button>
          {selected && (
            <button
              type="button"
              className="secondary"
              onClick={() => showGroup(selected)}
            >
              <Icon name="settings" />
              {t("ui.manage-group")}
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              dialog.close();
              openProfile();
            }}
          >
            <Icon name="user" />
            {t("ui.my-profile")}
          </button>
        </div>
        {Boolean(overview?.invitations.length) && invitations(showHome)}
      </>,
    );
    dialog
      .querySelector('.family-group-tabs [aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!invite) return;
    const found = overview?.invitations.find((item) => item.id === invite);
    invite = undefined;
    history.replaceState(
      history.state,
      "",
      location.pathname + location.search,
    );
    if (found) reviewInvite(found, showHome);
    else message(errors.expired, true);
  }

  const showInbox = () =>
    page("دعوت‌های دریافتی", invitations(showInbox), showHome);
  function openInbox() {
    if (!dialog.open) dialog.showModal();
    showInbox();
    fit();
    const request = generation;
    void refreshInbox().then(() => {
      if (active(request)) showInbox();
    });
  }

  function groupEditor(group?: Group) {
    let created: string | undefined;
    page(
      group ? "ویرایش گروه" : "ساخت گروه",
      <GroupForm
        group={group}
        run={run}
        manager={
          profileName(getState()?.personalProfile) || overview?.label || ""
        }
        submit={async (name, icon) => {
          const request = generation;
          if (group) {
            await familyRequest("update-group", {
              group: group.id,
              name,
              icon,
            });
            if (active(request))
              await refresh(group.id, (updated) => {
                showGroup(updated);
                message("تغییرات گروه ذخیره شد.");
              });
          } else {
            created ??= (await familyRequest("create", { name, icon })).group;
            if (active(request)) await refresh(created, afterCreate);
          }
        }}
      />,
      group ? () => showGroup(group) : showHome,
    );
  }

  function afterCreate(group: Group) {
    page(
      "گروه ساخته شد",
      <>
        <GroupBanner name={group.name} icon={group.icon} caption="گروه فعال" />
        <p className="quiet">{t("ui.invite-people-by-email")}</p>
        <button
          type="button"
          className="block-action"
          onClick={() => inviteMember(group)}
        >
          {t("ui.invite-members")}
        </button>
        <button
          type="button"
          className="text-button block-action"
          onClick={() => showGroup(group)}
        >
          {t("ui.ill-do-this-later")}
        </button>
      </>,
      () => showGroup(group),
    );
  }

  function showGroup(group: Group) {
    const members = group.members.filter((member) => !member.self);
    const received = members.filter((member) => member.received);
    page(
      "مدیریت گروه",
      <>
        <GroupBanner name={group.name} icon={group.icon} caption="اعضای گروه" />
        <div className="family-group-links">
          {group.manager && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => groupEditor(group)}
              >
                <Icon name="pen" />
                {t("ui.edit-name-and-icon")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => inviteMember(group)}
              >
                <Icon name="plus" />
                {t("ui.invite-a-member")}
              </button>
            </>
          )}
          <FamilyAction run={run} work={() => refresh(group.id, showGroup)}>
            <Icon name="refresh" />
            {t("تازه‌کردن دسترسی‌ها")}
          </FamilyAction>
          {group.manager && (
            <button
              type="button"
              className="secondary family-danger"
              onClick={() => confirmDeletion(group)}
            >
              {t("ui.delete-group")}
            </button>
          )}
        </div>
        {members.length ? (
          <>
            {members.length > 1 && (
              <button
                type="button"
                className="secondary"
                onClick={() => editGrant(group)}
              >
                {t("ui.share-with-all-current-members")}
              </button>
            )}
            <FamilySection title="سوابقی که می‌بینم">
              {received.length ? (
                received.map((member) => (
                  <article className="family-card" key={member.id}>
                    <h4>{member.label}</h4>
                    <p className="quiet">{policyText(member.received!)}</p>
                    <FamilyAction
                      run={run}
                      work={() => showCare(group, member)}
                    >
                      {t("دیدن برنامه")}
                    </FamilyAction>
                  </article>
                ))
              ) : (
                <p className="quiet">
                  {t("ui.no-members-are-sharing-records-with-you-yet")}
                </p>
              )}
            </FamilySection>
            <FamilySection title="چه کسانی سوابقم را می‌بینند؟">
              {members.map((member) => (
                <article className="family-card" key={member.id}>
                  <h4>{member.label}</h4>
                  <p className="quiet">
                    {member.given
                      ? policyText(member.given)
                      : t("ui.access-not-granted")}
                  </p>
                  <div className="buttons">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => editGrant(group, member)}
                    >
                      {t(member.given ? "مدیریت دسترسی" : "اعطای دسترسی")}
                    </button>
                    {member.given && (
                      <button
                        type="button"
                        className="secondary family-danger"
                        onClick={() => confirmRevoke(group, member)}
                      >
                        {t("ui.revoke-access")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </FamilySection>
          </>
        ) : (
          <p className="quiet">{t("ui.no-other-members-have-joined-yet")}</p>
        )}
      </>,
      showHome,
    );
  }

  function confirmDeletion(group: Group) {
    const back = () => showGroup(group);
    let removed = false;
    page(
      "حذف گروه",
      <>
        <GroupBanner name={group.name} icon={group.icon} caption="حذف گروه" />
        <p>
          {t("ui.deleting-this-group-removes-its-invitations-and-shared-pe")}
        </p>
        <button type="button" className="secondary" onClick={back}>
          {t("ui.cancel")}
        </button>
        <FamilyAction
          className="secondary family-danger"
          run={run}
          work={async () => {
            const request = generation;
            if (!removed) {
              await familyRequest("delete-group", { group: group.id });
              removed = true;
            }
            if (activeGroup === group.id) {
              activeGroup = null;
              try {
                storage?.removeItem(groupPreference);
              } catch {
                storage = undefined;
              }
            }
            await refreshGroup();
            if (active(request)) {
              showHome();
              message("گروه حذف شد.");
            }
          }}
        >
          {t("حذف گروه")}
        </FamilyAction>
      </>,
      back,
    );
  }

  function inviteMember(group: Group) {
    const update = (request: number, notice?: string) => {
      if (!active(request)) return;
      const next = overview?.groups.find((item) => item.id === group.id);
      if (next) {
        inviteMember(next);
        if (notice) message(notice);
      }
    };
    page(
      "دعوت به گروه",
      <>
        <FamilyForm
          className="family-content family-compose sheet-form"
          run={run}
          submit={async (data) => {
            const request = generation;
            const { delivered } = await familyRequest("invite", {
              group: group.id,
              email: String(data.get("email")).trim(),
              language,
            });
            if (!active(request)) return;
            await refreshGroup();
            update(
              request,
              delivered
                ? "دعوت با ایمیل فرستاده شد."
                : "دعوت ثبت شد. برای فرستادن، لینک دعوت را کپی کنید.",
            );
          }}
        >
          <GroupBanner
            name={group.name}
            icon={group.icon}
            caption="دعوت به گروه"
          />
          <label>
            {t("ui.email")}
            <input
              type="email"
              name="email"
              dir="ltr"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
            />
          </label>
          <button type="submit" className="block-action">
            {t("ارسال دعوت")}
          </button>
        </FamilyForm>
        <FamilySection title="دعوت‌های در انتظار">
          {group.pending.map((item) => (
            <InvitationLink
              key={item.id}
              item={item}
              run={run}
              copied={() => message("لینک دعوت کپی شد.")}
              removed={async () => {
                const request = generation;
                await familyRequest("cancel", { invite: item.id });
                await refreshGroup();
                update(request);
              }}
            />
          ))}
        </FamilySection>
      </>,
      () => showGroup(group),
    );
  }

  function reviewInvite(item: Invitation, back: () => void) {
    page(
      "دعوت به گروه",
      <>
        <FamilyHero
          title={item.name}
          subtitle={t("ui.invited-by-value", item.inviter)}
          art="notification"
        />
        <FamilyAction
          run={run}
          work={async () => {
            const request = generation;
            const { group } = await familyRequest("accept", {
              invite: item.id,
            });
            if (active(request) && (await refresh(group)))
              message(
                "عضویت پذیرفته شد. اکنون می‌توانید دسترسی‌ها را انتخاب کنید.",
              );
          }}
        >
          {t("پذیرش عضویت")}
        </FamilyAction>
        <FamilyAction
          run={run}
          work={async () => {
            const request = generation;
            await familyRequest("decline", { invite: item.id });
            if (active(request)) await refresh();
          }}
        >
          {t("رد دعوت")}
        </FamilyAction>
        <p className="quiet">
          {t("ui.you-choose-whether-to-share-your-records")}
        </p>
      </>,
      back,
    );
  }

  function editGrant(group: Group, member?: Member) {
    page(
      "دسترسی به سوابق من",
      <GrantForm
        member={member}
        run={run}
        submit={async (data) => {
          const request = generation;
          await familyRequest("share", {
            group: group.id,
            target: member?.id ?? "all",
            all: data.get("view") === "all",
            sections: data.getAll("section"),
            record: data.has("record"),
            add: data.has("add"),
            days:
              data.get("days") === "keep"
                ? "keep"
                : Number(data.get("days")) || null,
          });
          if (active(request) && (await refresh(group.id, showGroup)))
            message(
              getState()?.accountCare?.enabled
                ? "دسترسی ذخیره شد."
                : "دسترسی ذخیره شد. برای دیدن سوابق این دستگاه، همگام‌سازی حساب را فعال کنید.",
            );
        }}
      />,
      () => showGroup(group),
    );
  }

  function confirmRevoke(group: Group, member: Member) {
    const back = () => showGroup(group);
    page(
      "قطع دسترسی",
      <>
        <FamilyHero
          title={t("ui.revoke-access-for-value", member.label)}
          subtitle={t("ui.they-will-remain-in-the-group")}
        />
        <p>
          {t(
            "ui.value-will-lose-access-to-your-records-through-this-group",
            member.label,
          )}
        </p>
        <button type="button" className="secondary" onClick={back}>
          {t("ui.cancel")}
        </button>
        <FamilyAction
          className="secondary family-danger"
          run={run}
          work={async () => {
            const request = generation;
            await familyRequest("revoke", {
              group: group.id,
              target: member.id,
            });
            if (active(request) && (await refresh(group.id, showGroup)))
              message("دسترسی قطع شد.");
          }}
        >
          {t("قطع دسترسی")}
        </FamilyAction>
      </>,
      back,
    );
  }

  function openPage(title: string, content: ReactNode) {
    page(title, content);
    if (!dialog.open) dialog.showModal();
    fit();
    $("family-title").focus({ preventScroll: true });
  }
  function closeFamilyEditors() {
    delegated.cancel();
    if (getFamilyView() && quick.open) quick.close();
    for (const editor of document.querySelectorAll<HTMLDialogElement>(
      "dialog[data-family-editor][open]",
    ))
      editor.close();
  }
  function leave(notice?: string) {
    access.stop();
    closeFamilyEditors();
    if (!getFamilyView()) return;
    if (dialog.open) dialog.close();
    setFamilyView(null, notice);
    paintContext();
  }

  function enter(
    group: Group,
    member: Member,
    data: SharedCare,
    notice?: string,
  ) {
    const view: FamilyView = sharedContext(data, group, member, {
      authorName: (entry: { recordedBy?: string; recordedByName?: string }) =>
        (entry.recordedBy === overview?.label &&
          profileName(getState()?.personalProfile)) ||
        entry.recordedByName ||
        entry.recordedBy ||
        "",
      record: (details: Parameters<FamilyView["record"]>[0]) => {
        const current = getFamilyView();
        if (
          !sameOwner(current, group.id, member.id) ||
          !current.canRecord(details.kind, details.day)
        )
          return;
        if (details.kind === "water" || details.kind === "cycle")
          delegated.openFor(current, details.kind, details.day, "record");
        else if ("id" in details) recordFor(current, details);
      },
      add: (kind: Kind, day: number) => {
        const current = getFamilyView();
        if (sameOwner(current, group.id, member.id) && current.canAdd(kind))
          delegated.openFor(current, kind, Math.max(day, current.today), "add");
      },
      profile: () => {
        const current = getFamilyView();
        if (!sameOwner(current, group.id, member.id) || !current.has("profile"))
          return;
        openPage(
          "پروفایل",
          <>
            <FamilyHero title={current.name} subtitle={group.name} />
            <ProfileFacts profile={data.records.profile ?? {}} />
          </>,
        );
      },
    });
    access.set({ group, member, data, day: view.today });
    setFamilyView(view, notice);
    paintContext();
  }

  async function showCare(group: Group, member: Member) {
    const request = generation;
    message("در حال ارتباط…");
    const data = await readFamilyView({
      group: group.id,
      target: member.id,
    });
    if (!active(request)) return;
    chooseGroup(group);
    dialog.close();
    enter(group, member, data);
    access.start();
    $("family-home").focus({ preventScroll: true });
  }

  async function saved(notice: string, view: FamilyView, close = true) {
    if (!sameOwner(getFamilyView(), view.group.id, view.member.id)) return;
    if (close && dialog.open) dialog.close();
    await access.check({ feedback: t(notice), force: true });
  }

  function recordFor(view: FamilyView, details: Delegated) {
    const { kind, day, title, id } = details;
    const group = view.group.id,
      target = view.member.id,
      operation = crypto.randomUUID();
    const heading = t("ui.record-for-value", view.name);
    async function record(values: object) {
      const current = getFamilyView();
      if (!sameOwner(current, group, target) || !current.canRecord(kind, day))
        throw new Error("forbidden");
      await familyRequest("record", {
        group,
        target,
        operation,
        kind,
        day,
        id,
        ...values,
      });
      await saved("ثبت انجام شد.", view);
    }
    if (details.kind === "medicine") {
      const request = generation + 1;
      openPage(
        heading,
        <FamilyDoseForm
          title={title}
          member={view.name}
          dose={details}
          showError={(error) => {
            if (active(request))
              message(errors[reason(error)] ?? unavailable, true);
          }}
          clearError={() => message()}
          save={(status, amount) =>
            record({ minute: details.minute, status, amount, result: true })
          }
        />,
      );
      return;
    }
    const routine = details.kind === "routine" ? details.routine : undefined;
    openPage(
      heading,
      <FamilyForm
        run={run}
        submit={(data) =>
          record({
            result:
              routine?.mode === "steps"
                ? data.getAll("step").map(Number)
                : routine?.mode === "quantity"
                  ? Number(data.get("result"))
                  : true,
          })
        }
      >
        <FamilyHero title={title} subtitle={view.name} art={kind} />
        <p className="family-card">
          {t("ui.your-name-will-be-attached-to-the-entry")}
        </p>
        {routine?.mode === "quantity" && (
          <label>
            {t("مقدار انجام‌شده")}
            <input
              type="number"
              name="result"
              defaultValue={routine.amount ?? routine.target}
              required
            />
          </label>
        )}
        {routine?.mode === "steps" &&
          routine.steps?.map((step, index) => (
            <label key={index}>
              <input
                type="checkbox"
                name="step"
                value={index}
                defaultChecked={routine.checked?.includes(index)}
              />
              {step}
            </label>
          ))}
        <button type="submit" className="block-action">
          {t("ذخیره برای {0}", view.name)}
        </button>
      </FamilyForm>,
    );
  }

  async function open() {
    openPage("گروه‌ها و اعضا", null);
    message("در حال ارتباط…");
    const request = generation;
    try {
      await refresh();
    } catch (error) {
      if (!active(request)) return;
      const needsAccount = reason(error) === "sign_in";
      page(
        "گروه‌ها و اعضا",
        <FamilyAction
          run={run}
          work={
            needsAccount
              ? async () => {
                  recovery = true;
                  dialog.close();
                  await openAccount();
                }
              : open
          }
        >
          {t(needsAccount ? "ورود به حساب مدورا" : "تلاش دوباره")}
        </FamilyAction>,
      );
      message(errors[reason(error)] ?? unavailable, true);
    }
  }
  async function refreshInbox() {
    if (!overview || document.hidden || !navigator.onLine) return;
    const previous = overview;
    try {
      const { invitations } = await familyRequest("inbox");
      if (overview === previous) {
        overview = { ...previous, invitations };
        paintContext();
      }
    } catch (error) {
      if (reason(error) === "sign_in" && overview === previous) {
        overview = null;
        paintContext();
      }
    }
  }

  dialog.addEventListener("cancel", (event) => {
    if (!screen.parent) return;
    event.preventDefault();
    screen.parent();
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open) page("ui.care-groups", null);
  });
  $("settings-open-family").addEventListener("click", () => {
    ($("settings-dialog") as HTMLDialogElement).close();
    void open();
  });
  setInterval(() => void refreshInbox(), 30_000);
  window.addEventListener("online", () => void refreshInbox());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    void refreshInbox();
    if (getFamilyView()) void access.check();
  });
  window.addEventListener("hashchange", () => {
    invite = inviteHash.exec(location.hash)?.[1];
    if (invite) void open();
  });
  window.addEventListener("offline", () => {
    if (getFamilyView()) leave(t(errors.offline));
    if (dialog.open) {
      page(
        "گروه‌ها و اعضا",
        <FamilyAction run={run} work={open}>
          {t("تلاش دوباره")}
        </FamilyAction>,
      );
      message(errors.offline, true);
    }
  });
  paint();
  paintContext();
  return {
    leave,
    quickWater: delegated.quickWater,
    refreshGroup: () => refreshGroup().catch(() => undefined),
    openInvitation: () => {
      if (invite || recovery) void open();
      recovery = false;
    },
  };
}
