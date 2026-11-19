import { familyRequest } from "../../../product-assets/public/medication/features/family/api.js";
import { quickActions } from "../../../product-assets/public/medication/features/family/quick-action.js";
import { localWall, timezone } from "@medora/domain/browser/wall-clock";
import type { FamilyView } from "../productState";
import { showFamilyNotice } from "./FamilyNotice";

type Kind = Parameters<FamilyView["canRecord"]>[0];
export type OpenFamilyPlan = (kind: Kind, target: {
  name: string;
  day: number;
  zone: string;
  time?: string;
  save(values: object): Promise<void>;
}) => void;

interface Options {
  storage: Storage | undefined;
  getFamilyView(): FamilyView | null;
  openPlan: OpenFamilyPlan;
  onSaved(notice: string, view: FamilyView, close?: boolean): Promise<void>;
  onForbidden(): void;
  errorMessage(error: unknown): string;
  closeDialog(): void;
  closeEditors(): void;
}

export function sameOwner(
  view: FamilyView | null,
  group: string,
  member: string,
): view is FamilyView {
  return view?.group.id === group && view.member.id === member;
}

const clockFor = (zone: string) =>
  new Date(localWall(Date.now(), timezone(zone))).toISOString().slice(11, 16);

export function installDelegatedCare({
  storage, getFamilyView, openPlan, onSaved, onForbidden, errorMessage,
  closeDialog, closeEditors,
}: Options) {
  let editorOperation: string | undefined;
  const waterActions = quickActions(storage ? { storage } : {});

  async function quickWater(
    view: FamilyView,
    day: number,
    amount: number,
    control: HTMLElement | undefined,
  ) {
    if (!view.canRecord("water", day)) return;
    const key = JSON.stringify([view.group.id, view.member.id, day, amount]);
    const attempt = waterActions.start(key, () => clockFor(view.zone));
    if (!attempt) return;
    if (control instanceof HTMLButtonElement) control.disabled = true;
    let confirmed = false;
    try {
      await familyRequest("record", {
        group: view.group.id,
        target: view.member.id,
        operation: attempt.operation,
        kind: "water",
        day,
        amount,
        time: attempt.time,
      });
      confirmed = true;
      if (sameOwner(getFamilyView(), view.group.id, view.member.id))
        await onSaved("ui.water-logged", view, false);
    } catch (error) {
      if (!sameOwner(getFamilyView(), view.group.id, view.member.id)) return;
      if (error instanceof Error && error.message === "forbidden") onForbidden();
      else showFamilyNotice(errorMessage(error));
    } finally {
      waterActions.finish(key, confirmed);
      if (control instanceof HTMLButtonElement) control.disabled = false;
    }
  }

  function openFor(
    view: FamilyView,
    kind: Kind,
    day: number,
    action: "record" | "add",
  ) {
    const { group, member } = view;
    const operation = crypto.randomUUID();
    closeDialog();
    editorOperation = operation;
    openPlan(kind, {
      name: view.name,
      day,
      zone: view.zone,
      ...(kind === "water" && { time: clockFor(view.zone) }),
      save: async (values) => {
        const current = getFamilyView();
        const date =
          "day" in values && typeof values.day === "number" ? values.day : day;
        if (
          !sameOwner(current, group.id, member.id) ||
          !(action === "record"
            ? current.canRecord(kind, date)
            : current.canAdd(kind))
        )
          throw new Error(errorMessage(new Error("forbidden")));
        try {
          await familyRequest(action, {
            group: group.id,
            target: member.id,
            operation,
            kind,
            ...(action === "record" ? values : { plan: values }),
          });
        } catch (error) {
          if (error instanceof Error && error.message === "forbidden" && editorOperation === operation)
            onForbidden();
          throw new Error(errorMessage(error));
        }
        if (editorOperation !== operation) return;
        closeEditors();
        await onSaved(
          action === "record" ? "ثبت انجام شد." : "برنامه اضافه شد.",
          view,
        );
      },
    });
  }

  return {
    quickWater,
    openFor,
    cancel() {
      editorOperation = undefined;
    },
  };
}
