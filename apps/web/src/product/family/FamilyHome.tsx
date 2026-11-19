import type { ReactNode } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { Icon } from "../PlanCard";
import {
  Avatar,
  FamilyAction,
  FamilyHero,
  FamilySection,
  GroupBanner,
  policyText,
  type Group,
  type Invitation,
  type Member,
  type Run,
} from "./FamilyViews";

export function FamilyInvitations({
  rows,
  review,
}: {
  rows: Invitation[];
  review(invitation: Invitation): void;
}) {
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
              onClick={() => review(item)}
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

export function FamilyHome({
  groups,
  selected,
  personalName,
  invitations,
  run,
  selectGroup,
  openOwnCare,
  openCare,
  createGroup,
  manageGroup,
  openProfile,
}: {
  groups: Group[];
  selected: Group | undefined;
  personalName: string;
  invitations: ReactNode;
  run: Run;
  selectGroup(group: Group): void;
  openOwnCare(): void;
  openCare(group: Group, member: Member): Promise<void>;
  createGroup(): void;
  manageGroup(group: Group): void;
  openProfile(): void;
}) {
  return (
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
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className="secondary"
                data-group={group.id}
                aria-pressed={group.id === selected.id}
                onClick={() => selectGroup(group)}
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
                const label = member.self ? personalName : member.label;
                const launch = member.self
                  ? openOwnCare
                  : member.received
                    ? () => openCare(selected, member)
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
          onClick={createGroup}
        >
          <Icon name="plus" />
          {t("ui.create-group")}
        </button>
        {selected && (
          <button
            type="button"
            className="secondary"
            onClick={() => manageGroup(selected)}
          >
            <Icon name="settings" />
            {t("ui.manage-group")}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={openProfile}
        >
          <Icon name="user" />
          {t("ui.my-profile")}
        </button>
      </div>
      {invitations}
    </>
  );
}
