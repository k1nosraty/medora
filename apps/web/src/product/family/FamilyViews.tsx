import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  groupIconOf,
  groupIcons,
} from "@medora/domain/browser/group-icons";
import {
  allFamilySections,
  familySections,
} from "@medora/domain/browser/family";
import { ageAt } from "@medora/domain/browser/profile";
import {
  localDigits,
  locale,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { searchKey } from "../../../product-assets/public/medication/shared/ui/controls.js";
import { sectionLabels } from "../../../product-assets/public/medication/features/family/labels.js";
import { Icon, PlanArtwork } from "../PlanCard";
import type { FamilyView } from "../productState";
import type { PersonalProfile } from "../settings/Preferences";

export type Scope = keyof typeof sectionLabels;
export interface Policy {
  sections: Scope[];
  record?: boolean;
  add?: boolean;
}
export interface Member {
  id: string;
  label: string;
  self?: boolean;
  given?: Policy | null;
  received?: Policy | null;
  givenExpires?: number | null;
}
export interface Invitation {
  id: string;
  name: string;
  inviter: string;
}
export interface Group {
  id: string;
  name: string;
  icon?: string;
  manager: boolean;
  members: Member[];
  pending: { id: string; recipient?: string; email?: string }[];
}
export interface Overview {
  groups: Group[];
  invitations: Invitation[];
  label: string;
}
export type Run = (work: () => unknown) => Promise<void>;

export function Avatar({ label, id }: { label: string; id: string }) {
  const initials = label
    .trim()
    .split(/[\s_]+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <span
      className="family-avatar"
      aria-hidden="true"
      data-tint={(id.charCodeAt(0) || 0) % 4}
    >
      {initials}
    </span>
  );
}

export function FamilyHero({
  title,
  subtitle,
  art = "control-user",
}: {
  title: string;
  subtitle?: string;
  art?: string;
}) {
  return (
    <div className="family-hero">
      <PlanArtwork id={art} />
      <div>
        <h3>{title}</h3>
        {subtitle && <p className="quiet">{subtitle}</p>}
      </div>
    </div>
  );
}

export function FamilyIcon({
  icon,
  className,
}: {
  icon?: string | undefined;
  className?: string;
}) {
  const art = groupIconOf(icon);
  return (
    <span className={className ?? "family-group-art"} aria-hidden="true">
      {art === "group" ? (
        <svg className="care-network-glyph" aria-hidden="true">
          <use href="#i-care-network" />
        </svg>
      ) : (
        <PlanArtwork id={art} />
      )}
    </span>
  );
}

export function GroupBanner({
  name,
  caption,
  icon,
}: {
  name: string;
  caption: string;
  icon?: string | undefined;
}) {
  return (
    <div className="family-group-hero">
      <p>
        <small>{t(caption)}</small>
        <strong dir="auto">{name}</strong>
      </p>
      <FamilyIcon icon={icon} />
    </div>
  );
}

export function policyText(policy: Policy) {
  const all =
    policy.sections.length === allFamilySections.length &&
    allFamilySections.every((key) => policy.sections.includes(key as Scope));
  return [
    all
      ? t("ui.view-everything")
      : policy.sections.map((key) => t(sectionLabels[key])).join(t("ui.and")),
    policy.record && t("ui.record-on-their-behalf"),
    policy.add && t("ui.add-a-schedule"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function FamilyAction({
  run,
  work,
  children,
  className = "secondary",
  ...attributes
}: {
  run: Run;
  work(): unknown;
  children: ReactNode;
} & Omit<ComponentProps<"button">, "type" | "onClick" | "children">) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  return (
    <button
      {...attributes}
      type="button"
      className={className}
      disabled={pending}
      onClick={async () => {
        if (lock.current) return;
        lock.current = true;
        setPending(true);
        try {
          await run(work);
        } finally {
          lock.current = false;
          setPending(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function FamilyForm({
  run,
  submit,
  className = "family-content",
  children,
}: {
  run: Run;
  submit(form: FormData): unknown;
  className?: string;
  children: ReactNode;
}) {
  const lock = useRef(false);
  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        const control = (event.nativeEvent as SubmitEvent).submitter;
        const form = new FormData(event.currentTarget);
        lock.current = true;
        if (control instanceof HTMLButtonElement) control.disabled = true;
        try {
          await run(() => submit(form));
        } finally {
          if (control instanceof HTMLButtonElement) control.disabled = false;
          lock.current = false;
        }
      }}
    >
      {children}
    </form>
  );
}

export function FamilySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="family-list">
      <h3>{t(title)}</h3>
      {children}
    </div>
  );
}

export function GroupForm({
  group,
  manager,
  run,
  submit,
}: {
  group?: Group | undefined;
  manager: string;
  run: Run;
  submit(name: string, icon: string): unknown;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [icon, setIcon] = useState(groupIconOf(group?.icon));
  const [search, setSearch] = useState("");
  const terms = search.split(/\s+/).map(searchKey).filter(Boolean);
  const matches = Object.entries(groupIcons).filter(([, label]) =>
    terms.every((term) => searchKey(t(label)).includes(term)),
  );
  return (
    <FamilyForm
      className="family-content family-compose sheet-form"
      run={run}
      submit={() => submit(name.trim(), icon)}
    >
      <GroupBanner
        name={name.trim() || group?.name || t("ui.new-group")}
        icon={icon}
        caption="پیش‌نمایش"
      />
      <label>
        {t("نام گروه")}
        <input
          name="name"
          dir="auto"
          maxLength={60}
          placeholder={t("ui.e-g-care-for-mom")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
      </label>
      <fieldset className="family-icon-options">
        <legend>{t("ui.group-icon")}</legend>
        <label className="choice-search cabinet-search">
          <Icon name="search" />
          <input
            type="search"
            autoComplete="off"
            placeholder={t("ui.search-group-icons")}
            aria-label={t("ui.search-group-icons")}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              if (matches.length === 1) setIcon(matches[0]![0]);
            }}
          />
        </label>
        <div className="family-icon-grid" hidden={!matches.length}>
          {Object.entries(groupIcons).map(([id, label]) => (
            <label
              title={t(label)}
              key={id}
              hidden={!matches.some(([match]) => match === id)}
            >
              <input
                type="radio"
                name="icon"
                value={id}
                checked={id === icon}
                aria-label={t(label)}
                onChange={() => setIcon(id)}
              />
              <FamilyIcon icon={id} />
            </label>
          ))}
        </div>
        <p className="empty" hidden={matches.length > 0}>
          {t("ui.no-matching-icons")}
        </p>
      </fieldset>
      {!group && (
        <>
          <p className="quiet">{t("ui.group-manager-value", manager)}</p>
          <p className="quiet">{t("ui.each-member-decides-what-to-share")}</p>
        </>
      )}
      <button className="block-action" type="submit">
        {t(group ? "ذخیرهٔ تغییرات" : "ساخت گروه")}
      </button>
    </FamilyForm>
  );
}

export function GrantForm({
  member,
  run,
  submit,
}: {
  member?: Member | undefined;
  run: Run;
  submit(data: FormData): unknown;
}) {
  const existing = member?.given;
  const [custom, setCustom] = useState(
    Boolean(
      existing &&
      (existing.sections.length !== allFamilySections.length ||
        !allFamilySections.every((key) =>
          existing.sections.includes(key as Scope),
        )),
    ),
  );
  return (
    <FamilyForm run={run} submit={submit}>
      <p data-recipient="" className="family-target">
        {t("ui.share-with-value", member?.label ?? t("ui.all-current-members"))}
      </p>
      <fieldset className="family-choice">
        <legend>{t("ui.view")}</legend>
        <label>
          <input
            type="radio"
            name="view"
            value="all"
            checked={!custom}
            onChange={() => setCustom(false)}
          />
          {t("ui.view-everything")}
        </label>
        <label>
          <input
            type="radio"
            name="view"
            value="custom"
            checked={custom}
            onChange={() => setCustom(true)}
          />
          {t("ui.choose-sections")}
        </label>
        <p className="quiet" data-scope="" hidden={custom}>
          {t("ui.profile-medication-dose-history-appointments-routines-wat")}
        </p>
        <p className="quiet">{t("ui.family-custom-private-sections")}</p>
        <div data-sections="" hidden={!custom}>
          {(familySections as Scope[]).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                name="section"
                value={key}
                defaultChecked={
                  existing?.sections.includes(key) ??
                  allFamilySections.includes(key)
                }
              />
              {t(sectionLabels[key])}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="family-choice">
        <legend>{t("ui.recording-and-scheduling-permissions")}</legend>
        <label>
          <input
            type="checkbox"
            name="record"
            role="switch"
            defaultChecked={Boolean(existing?.record)}
          />
          {t("ui.record-on-their-behalf")}
        </label>
        <label>
          <input
            type="checkbox"
            name="add"
            role="switch"
            defaultChecked={Boolean(existing?.add)}
          />
          {t("ui.add-a-schedule")}
        </label>
      </fieldset>
      <label>
        {t("ui.access-duration")}
        <select name="days" defaultValue={member?.givenExpires ? "keep" : ""}>
          {member?.givenExpires && (
            <option value="keep">{t("ui.keep-current-expiry")}</option>
          )}
          <option value="">{t("ui.until-revoked")}</option>
          {[7, 30, 90].map((days) => (
            <option value={days} key={days}>
              {t(`ui.${days}-days`)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="block-action">
        {t("ui.grant-access")}
      </button>
    </FamilyForm>
  );
}

export function InvitationLink({
  item,
  run,
  removed,
  copied,
}: {
  item: Group["pending"][number];
  run: Run;
  removed(): unknown;
  copied(): void;
}) {
  const [url, setUrl] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.select();
  }, [url]);
  return (
    <article className="family-card">
      <h4>{item.recipient ?? item.email}</h4>
      <div className="buttons">
        <FamilyAction
          run={run}
          work={async () => {
            const link = new URL(location.pathname, location.origin);
            link.hash = "family-invite=" + item.id;
            try {
              await navigator.clipboard.writeText(link.href);
              copied();
            } catch {
              setUrl(link.href);
            }
          }}
        >
          {t("کپی لینک دعوت")}
        </FamilyAction>
        <FamilyAction run={run} work={removed}>
          {t("لغو دعوت")}
        </FamilyAction>
      </div>
      {url && (
        <label>
          {t("لینک دعوت")}
          <input type="url" name="link" value={url} readOnly ref={field} />
        </label>
      )}
    </article>
  );
}

export function ProfileFacts({
  profile,
}: {
  profile: PersonalProfile & { gender?: string };
}) {
  const number = new Intl.NumberFormat(locale).format;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const age = ageAt(profile.birthDate, new Date());
  const genders: Record<string, string> = {
    female: "خانم",
    male: "آقا",
    undisclosed: "ترجیح می‌دهم نگویم",
  };
  const gender = profile.gender ? genders[profile.gender] : undefined;
  const facts = [
    [
      "نام و نام خانوادگی",
      [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    ],
    [
      "تاریخ تولد",
      profile.birthDate && date.format(new Date(profile.birthDate + "T00:00Z")),
    ],
    ["سن", age !== null && t("ui.value-years-old", number(age))],
    ["قد", profile.heightCm && number(profile.heightCm) + " " + t("ui.cm")],
    ["وزن", profile.weightKg && number(profile.weightKg) + " " + t("ui.kg")],
    ["جنسیت", gender && t(gender)],
  ].filter(([, value]) => Boolean(value));
  return facts.length ? (
    <dl className="family-facts">
      {facts.map(([label, value]) => (
        <div key={String(label)}>
          <dt>{t(label)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p>{t("ui.no-profile-information-has-been-added")}</p>
  );
}

export function InboxBadge({ count, open }: { count: number; open(): void }) {
  const label = count
    ? t("ui.value-pending-invitations", localDigits(count))
    : t("ui.received-invitations");
  return (
    <button
      type="button"
      className="icon-button care-inbox"
      id="open-care-inbox"
      aria-label={label}
      hidden={!count}
      onClick={open}
    >
      <Icon name="bell" />
      <span id="care-inbox-count" aria-hidden="true">
        {localDigits(count)}
      </span>
    </button>
  );
}

export function FamilyContext({
  group,
  count,
  view,
  open,
  leave,
}: {
  group: Group | undefined;
  count: number;
  view: FamilyView | null;
  open(): void;
  leave(): void;
}) {
  return (
    <>
      <button
        className="family-switcher"
        type="button"
        id="open-family"
        aria-haspopup="dialog"
        aria-controls="family-dialog"
        hidden={Boolean(view)}
        onClick={open}
      >
        <span
          id="family-switch-art"
          className="family-group-art"
          data-icon={groupIconOf(group?.icon)}
          aria-hidden="true"
        >
          {groupIconOf(group?.icon) === "group" ? (
            <svg className="care-network-glyph" aria-hidden="true">
              <use href="#i-care-network" />
            </svg>
          ) : (
            <PlanArtwork id={groupIconOf(group?.icon)} />
          )}
        </span>
        <span className="family-context-copy">
          <strong id="family-group-name">
            {group?.name ?? t("ui.care-groups")}
          </strong>
          <small id="family-group-caption">
            {t(group ? "گروه فعال" : "گروه‌ها و اعضا")}
          </small>
        </span>
        <span
          id="family-invite-badge"
          className="family-invite-badge"
          hidden={!count}
          aria-label={t("ui.value-pending-invitations", localDigits(count))}
        >
          <Icon name="bell" />
          <span id="family-invite-count">{localDigits(count)}</span>
        </span>
        <span
          className="family-avatar-stack"
          id="family-group-avatars"
          aria-hidden="true"
        >
          {group?.members
            .filter((member) => !member.self)
            .slice(0, 3)
            .map((member) => (
              <Avatar key={member.id} label={member.label} id={member.id} />
            ))}
        </span>
        <span className="family-switch-chevron" aria-hidden="true">
          <svg className="family-chevron">
            <use href="#i-expand" />
          </svg>
        </span>
      </button>
      <div id="family-member-bar" className="family-member-bar" hidden={!view}>
        <button
          type="button"
          id="family-member-identity"
          className="family-member-identity"
          disabled={!view?.profile}
          onClick={() => view?.profile?.()}
        >
          <span id="family-member-avatar">
            {view && <Avatar label={view.name} id={view.member.id} />}
          </span>
          <span className="family-context-copy">
            <strong id="family-member-name">{view?.name}</strong>
            <small id="family-member-group">{view?.group.name}</small>
          </span>
        </button>
        <button
          type="button"
          id="family-home"
          className="family-home"
          onClick={leave}
        >
          <Icon name="home" />
          <span>{t("ui.back-home")}</span>
        </button>
      </div>
    </>
  );
}
